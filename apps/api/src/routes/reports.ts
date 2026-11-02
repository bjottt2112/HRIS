import { Router, type Request, type Response } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asString } from "../lib/validation";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../lib/audit";
import { sendCsv, sendXlsx, type CellValue } from "../lib/spreadsheet";
import {
  countWorkingDays,
  parseWorkDays,
} from "../lib/leave-policy";
import {
  employeeScope,
  holidayDateKeys,
  jakartaDateKey,
  jakartaDayStart,
  monthRange,
} from "../lib/hr";

const router = Router();

router.use(requireAuth);

// GET /api/v1/reports/headcount
router.get("/headcount", async (req: Request, res: Response) => {
  const scope = await employeeScope(req);
  const employees = await prisma.employee.findMany({
    where: { deleted_at: null, ...scope },
    select: {
      id: true,
      department: true,
      status: true,
      employment: true,
      join_date: true,
      exit_date: true,
    },
  });

  const bucket = (
    key: "department" | "status" | "employment",
  ): Array<{ label: string; count: number }> => {
    const counts = new Map<string, number>();
    for (const employee of employees) {
      const label = employee[key] || "-";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  };

  const now = new Date();
  const active = employees.filter((employee) => employee.status === "Active").length;
  const newThisMonth = employees.filter((employee) => {
    const join = employee.join_date;
    return (
      join.getUTCFullYear() === now.getUTCFullYear() &&
      join.getUTCMonth() === now.getUTCMonth()
    );
  }).length;
  const exitedThisMonth = employees.filter((employee) => {
    const exit = employee.exit_date;
    return (
      exit &&
      exit.getUTCFullYear() === now.getUTCFullYear() &&
      exit.getUTCMonth() === now.getUTCMonth()
    );
  }).length;
  const exitedThisYear = employees.filter(
    (employee) =>
      employee.exit_date?.getUTCFullYear() === now.getUTCFullYear(),
  ).length;
  const turnoverRate =
    employees.length + exitedThisYear > 0
      ? Math.round(
          (exitedThisYear / (employees.length + exitedThisYear)) * 1000,
        ) / 10
      : 0;

  res.json({
    total: employees.length,
    active,
    newThisMonth,
    exitedThisMonth,
    exitedThisYear,
    turnoverRate,
    byDepartment: bucket("department"),
    byStatus: bucket("status"),
    byEmployment: bucket("employment"),
  });
});

async function attendanceByDepartment(
  scope: Prisma.EmployeeWhereInput,
  month?: string,
) {
  const { start, end } = monthRange(month);
  const employees = await prisma.employee.findMany({
    where: { deleted_at: null, status: { not: "Inactive" }, ...scope },
    include: { schedule: true },
  });

  const employeeIds = employees.map((employee) => employee.id);
  const effectiveEnd =
    end.getTime() > Date.now() ? new Date(`${jakartaDateKey()}T00:00:00.000Z`) : end;
  const [records, leaves, holidays] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: {
        date: { gte: start, lte: end },
        employee_id: { in: employeeIds },
      },
      select: { employee_id: true, status: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        employee_id: { in: employeeIds },
        status: "APPROVED",
        start_date: { lte: effectiveEnd },
        end_date: { gte: start },
        leave_type: { code: { not: "UNPAID" } },
      },
      select: { employee_id: true, start_date: true, end_date: true },
    }),
    holidayDateKeys(start, end),
  ]);

  const byDepartment = new Map<
    string,
    { department: string; employees: number; present: number; late: number; absent: number; workingDays: number }
  >();

  for (const employee of employees) {
    const key = employee.department || "-";
    const entry =
      byDepartment.get(key) ??
      {
        department: key,
        employees: 0,
        present: 0,
        late: 0,
        absent: 0,
        workingDays: 0,
      };

    const workDays = parseWorkDays(employee.schedule?.work_days);
    const workingDays = countWorkingDays(
      start,
      effectiveEnd,
      workDays,
      holidays,
    );
    const own = records.filter((record) => record.employee_id === employee.id);
    const leaveDays = leaves
      .filter((leave) => leave.employee_id === employee.id)
      .reduce((total, leave) => {
        const from = leave.start_date < start ? start : leave.start_date;
        const to =
          leave.end_date > effectiveEnd ? effectiveEnd : leave.end_date;
        if (from.getTime() > to.getTime()) return total;
        return total + countWorkingDays(from, to, workDays, holidays);
      }, 0);

    entry.employees += 1;
    entry.workingDays += workingDays;
    entry.present += own.length;
    entry.late += own.filter((record) => record.status === "Late").length;
    entry.absent += Math.max(0, workingDays - own.length - leaveDays);
    byDepartment.set(key, entry);
  }

  return {
    month: start.toISOString().slice(0, 7),
    departments: [...byDepartment.values()].sort((a, b) =>
      a.department.localeCompare(b.department),
    ),
  };
}

// GET /api/v1/reports/attendance?month=YYYY-MM
router.get("/attendance", async (req: Request, res: Response) => {
  const scope = await employeeScope(req);
  res.json(await attendanceByDepartment(scope, asString(req.query.month)));
});

// GET /api/v1/reports/leave?year=YYYY
router.get("/leave", async (req: Request, res: Response) => {
  const scope = await employeeScope(req);
  const year = Number(req.query.year) || new Date().getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59));

  const [types, requests, balances] = await Promise.all([
    prisma.leaveType.findMany({ orderBy: { code: "asc" } }),
    prisma.leaveRequest.groupBy({
      by: ["leave_type_id", "status"],
      where: {
        start_date: { gte: start },
        end_date: { lte: end },
        employee: { ...scope, deleted_at: null },
      },
      _sum: { days: true },
      _count: { _all: true },
    }),
    prisma.leaveBalance.findMany({
      where: { year, employee: { ...scope, deleted_at: null } },
      select: { leave_type_id: true, entitled: true, carried_over: true, used: true },
    }),
  ]);

  const report = types.map((type) => {
    const approved = requests.filter(
      (row) => row.leave_type_id === type.id && row.status === "APPROVED",
    );
    const pending = requests.filter(
      (row) => row.leave_type_id === type.id && row.status === "PENDING",
    );
    const typeBalances = balances.filter((row) => row.leave_type_id === type.id);

    return {
      leaveTypeId: type.id,
      code: type.code,
      name: type.name,
      approvedDays: approved.reduce((total, row) => total + (row._sum.days ?? 0), 0),
      approvedRequests: approved.reduce((total, row) => total + row._count._all, 0),
      pendingRequests: pending.reduce((total, row) => total + row._count._all, 0),
      totalEntitled: typeBalances.reduce(
        (total, row) => total + row.entitled + row.carried_over,
        0,
      ),
      totalUsed: typeBalances.reduce((total, row) => total + row.used, 0),
    };
  });

  res.json({ year, types: report });
});

// GET /api/v1/reports/leave/export?year=YYYY&format=csv|xlsx
router.get(
  "/leave/export",
  requireRole("SUPER_ADMIN", "HR_ADMIN"),
  async (req: Request, res: Response) => {
    const year = Number(req.query.year) || new Date().getUTCFullYear();
    const format = (asString(req.query.format) ?? "csv").toLowerCase();

    const balances = await prisma.leaveBalance.findMany({
      where: { year, employee: { deleted_at: null } },
      include: {
        leave_type: { select: { code: true, name: true } },
        employee: { select: { nik: true, name: true, department: true } },
      },
      orderBy: [{ employee: { name: "asc" } }, { leave_type: { code: "asc" } }],
    });

    const headers = [
      "Tahun",
      "NIK",
      "Nama",
      "Departemen",
      "Jenis Cuti",
      "Hak",
      "Carry Over",
      "Terpakai",
      "Sisa",
    ];
    const rows: CellValue[][] = balances.map((balance) => {
      const total = balance.entitled + balance.carried_over;
      return [
        balance.year,
        balance.employee.nik,
        balance.employee.name,
        balance.employee.department,
        balance.leave_type.name,
        balance.entitled,
        balance.carried_over,
        balance.used,
        Math.max(0, total - balance.used),
      ];
    });

    await writeAudit({
      actorId: req.auth?.sub,
      action: "report.leave.export",
      entity: "LeaveBalance",
      newValues: { year, format, count: balances.length },
      ip: req.ip,
    });

    if (format === "xlsx") {
      await sendXlsx(res, `laporan-cuti-${year}.xlsx`, "Laporan Cuti", headers, rows);
      return;
    }

    sendCsv(res, `laporan-cuti-${year}.csv`, headers, rows);
  },
);

// GET /api/v1/reports/attendance/today — feed ringkas untuk dashboard
router.get("/attendance/today", async (req: Request, res: Response) => {
  const scope = await employeeScope(req);
  const [employees, records] = await Promise.all([
    prisma.employee.count({
      where: { deleted_at: null, status: { not: "Inactive" }, ...scope },
    }),
    prisma.attendanceRecord.findMany({
      where: {
        date: jakartaDayStart(),
        employee: { ...scope, deleted_at: null },
      },
      select: { status: true },
    }),
  ]);

  res.json({
    employees,
    present: records.length,
    late: records.filter((record) => record.status === "Late").length,
    notClockedIn: Math.max(0, employees - records.length),
  });
});

export default router;
