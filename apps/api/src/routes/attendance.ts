import { Router, type Request, type Response } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asString } from "../lib/validation";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../lib/audit";
import { notifyUserIds } from "../lib/notify";
import { isWithinGeofence, parseCoordinates } from "../lib/geo";
import {
  countWorkingDays,
  DEFAULT_WORK_DAYS,
  parseWorkDays,
} from "../lib/leave-policy";
import { sendCsv, sendXlsx, type CellValue } from "../lib/spreadsheet";
import {
  canReviewEmployee,
  employeeScope,
  getEmployeeForUser,
  holidayDateKeys,
  isHrRole,
  isLateAgainstSchedule,
  jakartaDateKey,
  jakartaDayStart,
  monthRange,
  parseDateOnly,
} from "../lib/hr";

const router = Router();

router.use(requireAuth);

const WORK_MODES = new Set(["OFFICE", "WFH", "FIELD"]);

class CorrectionConflictError extends Error {}

const attendanceInclude = {
  employee: {
    select: {
      id: true,
      nik: true,
      name: true,
      department: true,
      schedule_id: true,
    },
  },
} satisfies Prisma.AttendanceRecordInclude;

type AttendanceWithEmployee = Prisma.AttendanceRecordGetPayload<{
  include: typeof attendanceInclude;
}>;

function serializeAttendance(record: AttendanceWithEmployee) {
  return {
    id: record.id,
    employeeId: record.employee_id,
    employeeName: record.employee.name,
    department: record.employee.department,
    date: record.date,
    clockIn: record.clock_in,
    clockOut: record.clock_out,
    status: record.status,
    location: record.location,
    source: record.source,
    workMode: record.work_mode,
    latitude: record.latitude,
    longitude: record.longitude,
  };
}

const correctionInclude = {
  employee: { select: { id: true, name: true, department: true, user_id: true } },
  reviewer: { select: { id: true, name: true, email: true } },
} satisfies Prisma.AttendanceCorrectionInclude;

type CorrectionWithRelations = Prisma.AttendanceCorrectionGetPayload<{
  include: typeof correctionInclude;
}>;

function serializeCorrection(correction: CorrectionWithRelations) {
  return {
    id: correction.id,
    employeeId: correction.employee_id,
    employeeName: correction.employee.name,
    department: correction.employee.department,
    attendanceId: correction.attendance_id,
    date: correction.date,
    requestedClockIn: correction.requested_clock_in,
    requestedClockOut: correction.requested_clock_out,
    reason: correction.reason,
    status: correction.status,
    reviewerNote: correction.reviewer_note,
    reviewerName: correction.reviewer?.name ?? correction.reviewer?.email ?? null,
    decidedAt: correction.decided_at,
    createdAt: correction.created_at,
  };
}

// POST /api/v1/attendance/clock-in
router.post("/clock-in", async (req: Request, res: Response) => {
  const employee = await prisma.employee.findUnique({
    where: { user_id: req.auth!.sub },
    include: { schedule: true, work_location: true },
  });

  if (!employee || employee.deleted_at) {
    res.status(400).json({
      error:
        "Akun ini belum terhubung ke data karyawan. Hubungi HR untuk menautkan akun.",
    });
    return;
  }

  const date = jakartaDayStart();
  const existing = await prisma.attendanceRecord.findUnique({
    where: { employee_id_date: { employee_id: employee.id, date } },
  });

  if (existing) {
    res.status(409).json({ error: "Anda sudah clock in hari ini." });
    return;
  }

  const workModeInput = (asString(req.body?.workMode) ?? "OFFICE").toUpperCase();
  const workMode = WORK_MODES.has(workModeInput) ? workModeInput : "OFFICE";
  const coordinates = parseCoordinates(req.body?.latitude, req.body?.longitude);
  const location = employee.work_location;

  if (workMode === "OFFICE" && location) {
    if (!coordinates) {
      res.status(400).json({
        error:
          "Lokasi GPS wajib diaktifkan untuk absensi di kantor. Izinkan akses lokasi di browser.",
      });
      return;
    }

    const inside = isWithinGeofence(
      coordinates,
      { latitude: location.latitude, longitude: location.longitude },
      location.radius_meters,
    );

    if (!inside) {
      res.status(403).json({
        error: `Anda berada di luar area ${location.name} (radius ${location.radius_meters} m). Gunakan mode WFH jika diizinkan.`,
      });
      return;
    }
  }

  if (workMode === "WFH" && location && !location.allow_wfh) {
    res.status(403).json({ error: "WFH tidak diizinkan untuk lokasi kerja Anda." });
    return;
  }

  const now = new Date();
  const record = await prisma.attendanceRecord.create({
    data: {
      employee_id: employee.id,
      date,
      clock_in: now,
      status: isLateAgainstSchedule(
        now,
        employee.schedule?.start_time,
        employee.schedule?.late_tolerance_minutes ?? 0,
      )
        ? "Late"
        : "Present",
      location:
        asString(req.body?.note) ??
        (workMode === "WFH" ? "WFH" : (location?.name ?? employee.location)),
      source: "WEB",
      work_mode: workMode,
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null,
    },
    include: attendanceInclude,
  });

  await writeAudit({
    actorId: req.auth?.sub,
    action: "attendance.clock_in",
    entity: "AttendanceRecord",
    entityId: record.id,
    newValues: {
      clock_in: record.clock_in,
      status: record.status,
      work_mode: record.work_mode,
    },
    ip: req.ip,
  });

  res.status(201).json(serializeAttendance(record));
});

// POST /api/v1/attendance/clock-out
router.post("/clock-out", async (req: Request, res: Response) => {
  const employee = await getEmployeeForUser(req.auth?.sub);

  if (!employee || employee.deleted_at) {
    res.status(400).json({ error: "Akun ini belum terhubung ke data karyawan." });
    return;
  }

  const date = jakartaDayStart();
  const existing = await prisma.attendanceRecord.findUnique({
    where: { employee_id_date: { employee_id: employee.id, date } },
  });

  if (!existing) {
    res.status(404).json({ error: "Belum ada clock in hari ini." });
    return;
  }

  if (existing.clock_out) {
    res.status(409).json({ error: "Anda sudah clock out hari ini." });
    return;
  }

  const record = await prisma.attendanceRecord.update({
    where: { id: existing.id },
    data: { clock_out: new Date() },
    include: attendanceInclude,
  });

  await writeAudit({
    actorId: req.auth?.sub,
    action: "attendance.clock_out",
    entity: "AttendanceRecord",
    entityId: record.id,
    newValues: { clock_out: record.clock_out },
    ip: req.ip,
  });

  res.json(serializeAttendance(record));
});

// GET /api/v1/attendance/today
router.get("/today", async (req: Request, res: Response) => {
  const scope = await employeeScope(req);
  const records = await prisma.attendanceRecord.findMany({
    where: {
      date: jakartaDayStart(),
      employee: { ...scope, deleted_at: null },
    },
    include: attendanceInclude,
    orderBy: { clock_in: "asc" },
  });

  res.json(records.map(serializeAttendance));
});

// GET /api/v1/attendance/me?month=YYYY-MM
router.get("/me", async (req: Request, res: Response) => {
  const employee = await getEmployeeForUser(req.auth?.sub);

  if (!employee) {
    res.status(400).json({ error: "Akun ini belum terhubung ke data karyawan." });
    return;
  }

  const { start, end } = monthRange(asString(req.query.month));
  const records = await prisma.attendanceRecord.findMany({
    where: {
      employee_id: employee.id,
      date: { gte: start, lte: end },
    },
    include: attendanceInclude,
    orderBy: { date: "asc" },
  });

  res.json(records.map(serializeAttendance));
});

// GET /api/v1/attendance/summary?month=YYYY-MM
router.get("/summary", async (req: Request, res: Response) => {
  const scope = await employeeScope(req);
  const { start, end } = monthRange(asString(req.query.month));
  const department = asString(req.query.department);

  const employees = await prisma.employee.findMany({
    where: {
      deleted_at: null,
      status: { not: "Inactive" },
      ...scope,
      ...(department ? { department } : {}),
    },
    include: { schedule: true },
    orderBy: { name: "asc" },
  });

  const employeeIds = employees.map((employee) => employee.id);
  const [records, leaves, holidays] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { employee_id: { in: employeeIds }, date: { gte: start, lte: end } },
      select: { employee_id: true, date: true, status: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        employee_id: { in: employeeIds },
        status: "APPROVED",
        start_date: { lte: end },
        end_date: { gte: start },
        leave_type: { code: { not: "UNPAID" } },
      },
      select: { employee_id: true, start_date: true, end_date: true },
    }),
    holidayDateKeys(start, end),
  ]);

  const todayKey = jakartaDateKey();
  const effectiveEnd =
    end.getTime() > Date.now()
      ? new Date(`${todayKey}T00:00:00.000Z`)
      : end;

  const summary = employees.map((employee) => {
    const workDays = parseWorkDays(employee.schedule?.work_days ?? DEFAULT_WORK_DAYS);
    const workingDays = countWorkingDays(start, effectiveEnd, workDays, holidays);

    const own = records.filter((record) => record.employee_id === employee.id);
    const present = own.length;
    const late = own.filter((record) => record.status === "Late").length;

    const leaveDays = leaves
      .filter((leave) => leave.employee_id === employee.id)
      .reduce((total, leave) => {
        const from = leave.start_date < start ? start : leave.start_date;
        const to =
          leave.end_date > effectiveEnd ? effectiveEnd : leave.end_date;
        if (from.getTime() > to.getTime()) return total;
        return total + countWorkingDays(from, to, workDays, holidays);
      }, 0);

    return {
      employeeId: employee.id,
      employeeName: employee.name,
      department: employee.department,
      scheduleName: employee.schedule?.name ?? null,
      workingDays,
      present,
      late,
      onLeave: Math.min(leaveDays, workingDays),
      absent: Math.max(0, workingDays - present - leaveDays),
      attendanceRate:
        workingDays > 0 ? Math.round((present / workingDays) * 100) : 0,
    };
  });

  res.json({ month: start.toISOString().slice(0, 7), employees: summary });
});

// GET /api/v1/attendance/export?month=YYYY-MM&format=csv|xlsx
router.get(
  "/export",
  requireRole("SUPER_ADMIN", "HR_ADMIN"),
  async (req: Request, res: Response) => {
    const { start, end } = monthRange(asString(req.query.month));
    const format = (asString(req.query.format) ?? "csv").toLowerCase();

    const records = await prisma.attendanceRecord.findMany({
      where: { date: { gte: start, lte: end } },
      include: attendanceInclude,
      orderBy: [{ date: "asc" }, { clock_in: "asc" }],
    });

    const headers = [
      "Tanggal",
      "NIK",
      "Nama",
      "Departemen",
      "Clock In",
      "Clock Out",
      "Status",
      "Mode",
      "Lokasi",
    ];
    const rows: CellValue[][] = records.map((record) => [
      record.date.toISOString().slice(0, 10),
      record.employee.nik,
      record.employee.name,
      record.employee.department,
      record.clock_in.toISOString(),
      record.clock_out?.toISOString() ?? "",
      record.status,
      record.work_mode,
      record.location,
    ]);

    const month = start.toISOString().slice(0, 7);
    if (format === "xlsx") {
      await sendXlsx(res, `absensi-${month}.xlsx`, "Absensi", headers, rows);
      return;
    }

    sendCsv(res, `absensi-${month}.csv`, headers, rows);
  },
);

// ---------- Koreksi absensi ----------

// POST /api/v1/attendance/corrections
router.post("/corrections", async (req: Request, res: Response) => {
  const employee = await getEmployeeForUser(req.auth?.sub);

  if (!employee || employee.deleted_at) {
    res.status(400).json({ error: "Akun ini belum terhubung ke data karyawan." });
    return;
  }

  const date = parseDateOnly(asString(req.body?.date));
  const reason = asString(req.body?.reason);
  const requestedIn = asString(req.body?.requestedClockIn);
  const requestedOut = asString(req.body?.requestedClockOut);

  if (!date || !reason) {
    res.status(400).json({ error: "Tanggal dan alasan koreksi wajib diisi." });
    return;
  }

  if (reason.length > 500) {
    res.status(400).json({ error: "Alasan maksimal 500 karakter." });
    return;
  }

  const clockIn = requestedIn ? new Date(requestedIn) : null;
  const clockOut = requestedOut ? new Date(requestedOut) : null;

  if (requestedIn && Number.isNaN(clockIn?.getTime())) {
    res.status(400).json({ error: "Jam masuk tidak valid." });
    return;
  }
  if (requestedOut && Number.isNaN(clockOut?.getTime())) {
    res.status(400).json({ error: "Jam keluar tidak valid." });
    return;
  }
  if (!clockIn && !clockOut) {
    res.status(400).json({ error: "Isi minimal salah satu jam masuk atau keluar." });
    return;
  }
  if (clockIn && clockOut && clockOut.getTime() <= clockIn.getTime()) {
    res.status(400).json({ error: "Jam keluar harus setelah jam masuk." });
    return;
  }

  const attendance = await prisma.attendanceRecord.findUnique({
    where: { employee_id_date: { employee_id: employee.id, date } },
  });

  if (!attendance && !clockIn) {
    res.status(400).json({
      error:
        "Belum ada data absensi pada tanggal tersebut. Isi jam masuk agar koreksi dapat membuat absensi baru.",
    });
    return;
  }

  const pending = await prisma.attendanceCorrection.findFirst({
    where: { employee_id: employee.id, date, status: "PENDING" },
  });

  if (pending) {
    res.status(409).json({ error: "Sudah ada pengajuan koreksi untuk tanggal ini." });
    return;
  }

  const correction = await prisma.attendanceCorrection.create({
    data: {
      employee_id: employee.id,
      attendance_id: attendance?.id ?? null,
      date,
      requested_clock_in: clockIn,
      requested_clock_out: clockOut,
      reason,
      status: "PENDING",
    },
    include: correctionInclude,
  });

  await writeAudit({
    actorId: req.auth?.sub,
    action: "attendance.correction.create",
    entity: "AttendanceCorrection",
    entityId: correction.id,
    newValues: correction,
    ip: req.ip,
  });

  const manager = employee.manager_id
    ? await prisma.employee.findUnique({
        where: { id: employee.manager_id },
        select: { user_id: true },
      })
    : null;

  await notifyUserIds([manager?.user_id], {
    title: "Pengajuan koreksi absensi",
    message: `${employee.name} mengajukan koreksi absensi tanggal ${date.toISOString().slice(0, 10)}.`,
    type: "ATTENDANCE",
  });

  res.status(201).json(serializeCorrection(correction));
});

// GET /api/v1/attendance/corrections?status=
router.get("/corrections", async (req: Request, res: Response) => {
  const scope = await employeeScope(req);
  const status = asString(req.query.status)?.toUpperCase();

  const corrections = await prisma.attendanceCorrection.findMany({
    where: {
      employee: { ...scope, deleted_at: null },
      ...(status ? { status } : {}),
    },
    include: correctionInclude,
    orderBy: { created_at: "desc" },
    take: 100,
  });

  res.json(corrections.map(serializeCorrection));
});

// PATCH /api/v1/attendance/corrections/:id/decision
router.patch(
  "/corrections/:id/decision",
  requireRole("SUPER_ADMIN", "HR_ADMIN", "MANAGER"),
  async (req: Request, res: Response) => {
    const status = asString(req.body?.status)?.toUpperCase();
    const note = asString(req.body?.note);

    if (status !== "APPROVED" && status !== "REJECTED") {
      res.status(400).json({ error: "Status harus APPROVED atau REJECTED." });
      return;
    }

    const existing = await prisma.attendanceCorrection.findUnique({
      where: { id: String(req.params.id) },
      include: correctionInclude,
    });

    if (!existing) {
      res.status(404).json({ error: "Pengajuan koreksi tidak ditemukan." });
      return;
    }

    if (existing.status !== "PENDING") {
      res.status(409).json({
        error: `Koreksi sudah berstatus ${existing.status}.`,
      });
      return;
    }

    const allowed = await canReviewEmployee(req, existing.employee_id);
    if (!allowed) {
      res.status(403).json({
        error: "Anda hanya dapat memproses koreksi anggota tim Anda.",
      });
      return;
    }

    const actorEmployee = await getEmployeeForUser(req.auth?.sub);
    if (
      actorEmployee?.id === existing.employee_id &&
      req.auth?.role !== "SUPER_ADMIN"
    ) {
      res.status(403).json({
        error: "Anda tidak dapat menyetujui koreksi absensi sendiri.",
      });
      return;
    }

    if (status === "APPROVED") {
      const attendance = await prisma.attendanceRecord.findUnique({
        where: {
          employee_id_date: {
            employee_id: existing.employee_id,
            date: existing.date,
          },
        },
        select: { id: true },
      });

      if (!attendance && !existing.requested_clock_in) {
        res.status(409).json({
          error:
            "Tidak ada data absensi pada tanggal tersebut dan koreksi tidak memuat jam masuk. Minta karyawan mengajukan ulang dengan jam masuk.",
        });
        return;
      }
    }

    const updated = await prisma
      .$transaction(async (tx) => {
        const claimed = await tx.attendanceCorrection.updateMany({
          where: { id: existing.id, status: "PENDING" },
          data: {
            status,
            reviewer_id: req.auth?.sub ?? null,
            reviewer_note: note ?? null,
            decided_at: new Date(),
          },
        });

        if (claimed.count === 0) throw new CorrectionConflictError();

        const result = await tx.attendanceCorrection.findUnique({
          where: { id: existing.id },
          include: correctionInclude,
        });

        if (!result) throw new CorrectionConflictError();

        if (status === "APPROVED") {
          const attendance = await tx.attendanceRecord.findUnique({
            where: {
              employee_id_date: {
                employee_id: result.employee_id,
                date: result.date,
              },
            },
          });

          const employee = await tx.employee.findUnique({
            where: { id: result.employee_id },
            select: {
              schedule: {
                select: { start_time: true, late_tolerance_minutes: true },
              },
            },
          });

          const lateStatus = (clockIn: Date) =>
            isLateAgainstSchedule(
              clockIn,
              employee?.schedule?.start_time,
              employee?.schedule?.late_tolerance_minutes ?? 0,
            )
              ? "Late"
              : "Present";

          if (attendance) {
            const nextClockIn = result.requested_clock_in ?? attendance.clock_in;

            await tx.attendanceRecord.update({
              where: { id: attendance.id },
              data: {
                clock_in: nextClockIn,
                clock_out: result.requested_clock_out ?? attendance.clock_out,
                status: lateStatus(nextClockIn),
                source: "CORRECTION",
              },
            });
          } else if (result.requested_clock_in) {
            await tx.attendanceRecord.create({
              data: {
                employee_id: result.employee_id,
                date: result.date,
                clock_in: result.requested_clock_in,
                clock_out: result.requested_clock_out,
                status: lateStatus(result.requested_clock_in),
                location: "Koreksi",
                source: "CORRECTION",
                work_mode: "OFFICE",
              },
            });
          }
        }

        return result;
      })
      .catch((error: unknown) => {
        if (error instanceof CorrectionConflictError) return null;
        throw error;
      });

    if (!updated) {
      res.status(409).json({
        error:
          "Koreksi sudah diproses oleh pengguna lain. Muat ulang data.",
      });
      return;
    }

    await writeAudit({
      actorId: req.auth?.sub,
      action:
        status === "APPROVED"
          ? "attendance.correction.approve"
          : "attendance.correction.reject",
      entity: "AttendanceCorrection",
      entityId: updated.id,
      oldValues: { status: existing.status },
      newValues: { status: updated.status, note: updated.reviewer_note },
      ip: req.ip,
    });

    await notifyUserIds([updated.employee.user_id], {
      title:
        status === "APPROVED" ? "Koreksi absensi disetujui" : "Koreksi absensi ditolak",
      message: `Koreksi absensi tanggal ${updated.date.toISOString().slice(0, 10)} telah ${
        status === "APPROVED" ? "disetujui" : "ditolak"
      }.${updated.reviewer_note ? ` Catatan: ${updated.reviewer_note}` : ""}`,
      type: "ATTENDANCE",
    });

    res.json(serializeCorrection(updated));
  },
);

export default router;
