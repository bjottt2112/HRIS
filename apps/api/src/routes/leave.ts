import fs from "node:fs";
import { Router, type Request, type Response } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asString } from "../lib/validation";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../lib/audit";
import {
  emailUserIds,
  notifyUserIds,
} from "../lib/notify";
import {
  attachmentUpload,
  resolveAttachment,
  saveAttachment,
} from "../lib/uploads";
import {
  carryOverDays,
  carryOverExpiry,
  countWorkingDays,
  parseLeaveRange,
  parseWorkDays,
  proratedQuota,
} from "../lib/leave-policy";
import {
  canReviewEmployee,
  employeeScope,
  getEmployeeForUser,
  holidayDateKeys,
  isHrRole,
  monthRange,
  parseDateOnly,
} from "../lib/hr";

const router = Router();

router.use(requireAuth);

const leaveRequestInclude = {
  employee: {
    select: {
      id: true,
      name: true,
      department: true,
      user_id: true,
      join_date: true,
      schedule: { select: { work_days: true } },
    },
  },
  leave_type: {
    select: {
      id: true,
      code: true,
      name: true,
      default_quota: true,
      requires_attachment: true,
      requires_hr_approval: true,
    },
  },
} satisfies Prisma.LeaveRequestInclude;

type LeaveRequestWithRelations = Prisma.LeaveRequestGetPayload<{
  include: typeof leaveRequestInclude;
}>;

function serializeLeaveRequest(request: LeaveRequestWithRelations) {
  return {
    id: request.id,
    employeeId: request.employee_id,
    employeeName: request.employee.name,
    department: request.employee.department,
    leaveType: request.leave_type,
    startDate: request.start_date,
    endDate: request.end_date,
    days: request.days,
    reason: request.reason,
    status: request.status,
    stage: request.stage,
    attachmentName: request.attachment_name,
    hasAttachment: Boolean(request.attachment_path),
    reviewerNote: request.reviewer_note,
    decidedAt: request.decided_at,
    createdAt: request.created_at,
  };
}

type BalanceWithType = Prisma.LeaveBalanceGetPayload<{
  include: { leave_type: true };
}>;

function availableCarriedOver(balance: BalanceWithType, now = new Date()): number {
  if (!balance.carried_over) return 0;
  if (balance.expires_at && balance.expires_at.getTime() < now.getTime()) return 0;
  return balance.carried_over;
}

function remainingDays(balance: BalanceWithType): number {
  return Math.max(
    0,
    balance.entitled + availableCarriedOver(balance) - balance.used,
  );
}

class LeaveConflictError extends Error {}

class LeaveBalanceError extends Error {}

/**
 * Jenis cuti dengan kuota 0 (mis. Cuti Tanpa Gaji) diperlakukan sebagai
 * tanpa batas. Kuota pro-rata yang bernilai 0 tetap diperiksa karena jenis
 * cutinya memiliki default_quota > 0.
 */
function quotaEnforced(defaultQuota: number): boolean {
  return defaultQuota > 0;
}

/** Jumlah hari kerja per tahun kalender untuk rentang cuti. */
async function workingDaysByYear(
  start: Date,
  end: Date,
  workDays: Set<number>,
): Promise<Map<number, number>> {
  const holidays = await holidayDateKeys(start, end);
  const result = new Map<number, number>();

  for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year += 1) {
    const from = new Date(Math.max(start.getTime(), Date.UTC(year, 0, 1)));
    const to = new Date(
      Math.min(end.getTime(), Date.UTC(year, 11, 31, 23, 59, 59, 999)),
    );

    if (from.getTime() > to.getTime()) continue;
    result.set(year, countWorkingDays(from, to, workDays, holidays));
  }

  return result;
}

/**
 * Bagi total hari cuti ke tahun-tahun yang dilewati. Total selalu sama
 * dengan hari yang disimpan pada pengajuan, sehingga perubahan hari libur
 * setelah pengajuan tidak mengubah jumlah pemotongan saldo.
 */
function allocateDaysByYear(
  total: number,
  byYear: Map<number, number>,
): Map<number, number> {
  const years = [...byYear.entries()]
    .filter(([, days]) => days > 0)
    .sort(([a], [b]) => a - b);

  if (years.length === 0) return new Map();

  const allocations = new Map<number, number>();
  let remaining = total;

  years.forEach(([year, days], index) => {
    const isLast = index === years.length - 1;
    const allocated = isLast ? remaining : Math.min(days, remaining);
    if (allocated > 0) allocations.set(year, allocated);
    remaining -= allocated;
  });

  if (remaining > 0) {
    const lastYear = years[years.length - 1][0];
    allocations.set(lastYear, (allocations.get(lastYear) ?? 0) + remaining);
  }

  return allocations;
}

function serializeBalance(balance: BalanceWithType) {
  return {
    id: balance.id,
    year: balance.year,
    entitled: balance.entitled,
    carriedOver: availableCarriedOver(balance),
    used: balance.used,
    remaining: remainingDays(balance),
    expiresAt: balance.expires_at,
    leaveType: {
      id: balance.leave_type.id,
      code: balance.leave_type.code,
      name: balance.leave_type.name,
    },
  };
}

async function ensureBalances(
  employeeId: string,
  year: number,
): Promise<BalanceWithType[]> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { join_date: true },
  });
  const types = await prisma.leaveType.findMany({ orderBy: { code: "asc" } });

  const existing = await prisma.leaveBalance.findMany({
    where: { employee_id: employeeId, year },
    select: { leave_type_id: true },
  });
  const existingTypes = new Set(existing.map((item) => item.leave_type_id));

  for (const type of types) {
    if (existingTypes.has(type.id)) continue;

    let carriedOver = 0;
    let expiresAt: Date | null = null;

    if (type.carry_over_max > 0 && year > 2000) {
      const previous = await prisma.leaveBalance.findUnique({
        where: {
          employee_id_leave_type_id_year: {
            employee_id: employeeId,
            leave_type_id: type.id,
            year: year - 1,
          },
        },
      });

      if (previous) {
        carriedOver = carryOverDays(
          previous.entitled,
          previous.used,
          type.carry_over_max,
        );
        if (carriedOver > 0) expiresAt = carryOverExpiry(year - 1);
      }
    }

    await prisma.leaveBalance.create({
      data: {
        employee_id: employeeId,
        leave_type_id: type.id,
        year,
        entitled: proratedQuota(
          type.default_quota,
          employee?.join_date ?? null,
          year,
        ),
        carried_over: carriedOver,
        expires_at: expiresAt,
      },
    });
  }

  return prisma.leaveBalance.findMany({
    where: { employee_id: employeeId, year },
    include: { leave_type: true },
    orderBy: { leave_type: { code: "asc" } },
  });
}

async function hrUserIds(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { role: { in: ["SUPER_ADMIN", "HR_ADMIN"] }, status: "ACTIVE" },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

async function managerUserId(managerId: string | null): Promise<string | null> {
  if (!managerId) return null;
  const manager = await prisma.employee.findUnique({
    where: { id: managerId },
    select: { user_id: true },
  });
  return manager?.user_id ?? null;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// GET /api/v1/leave/types
router.get("/types", async (_req: Request, res: Response) => {
  res.json(await prisma.leaveType.findMany({ orderBy: { code: "asc" } }));
});

// GET /api/v1/leave/balances/me
router.get("/balances/me", async (req: Request, res: Response) => {
  const employee = await getEmployeeForUser(req.auth?.sub);

  if (!employee) {
    res.status(400).json({ error: "Akun ini belum terhubung ke data karyawan." });
    return;
  }

  const year = Number(req.query.year) || new Date().getUTCFullYear();
  const balances = await ensureBalances(employee.id, year);
  res.json(balances.map(serializeBalance));
});

// GET /api/v1/leave/balances/:employeeId (HR atau diri sendiri)
router.get("/balances/:employeeId", async (req: Request, res: Response) => {
  const employee = await getEmployeeForUser(req.auth?.sub);
  const targetId = String(req.params.employeeId);

  if (!isHrRole(req.auth?.role) && employee?.id !== targetId) {
    res.status(403).json({ error: "Anda tidak memiliki akses ke saldo ini." });
    return;
  }

  const year = Number(req.query.year) || new Date().getUTCFullYear();
  const balances = await ensureBalances(targetId, year);
  res.json(balances.map(serializeBalance));
});

// PATCH /api/v1/leave/balances/:employeeId/:typeId (HR)
router.patch(
  "/balances/:employeeId/:typeId",
  requireRole("SUPER_ADMIN", "HR_ADMIN"),
  async (req: Request, res: Response) => {
    const employeeId = String(req.params.employeeId);
    const typeId = String(req.params.typeId);
    const year = Number(req.body?.year) || new Date().getUTCFullYear();

    const target = await prisma.employee.findFirst({
      where: { id: employeeId, deleted_at: null },
      select: { id: true },
    });
    if (!target) {
      res.status(404).json({ error: "Karyawan tidak ditemukan." });
      return;
    }

    const existing = await prisma.leaveBalance.findUnique({
      where: {
        employee_id_leave_type_id_year: {
          employee_id: employeeId,
          leave_type_id: typeId,
          year,
        },
      },
    });

    if (!existing) {
      res.status(404).json({ error: "Saldo cuti belum dibuat untuk tahun ini." });
      return;
    }

    const data: Prisma.LeaveBalanceUpdateInput = {};
    if (req.body?.entitled !== undefined) {
      const entitled = Number(req.body.entitled);
      if (!Number.isInteger(entitled) || entitled < 0 || entitled > 365) {
        res.status(400).json({ error: "Kuota tidak valid." });
        return;
      }
      data.entitled = entitled;
    }
    if (req.body?.carriedOver !== undefined) {
      const carried = Number(req.body.carriedOver);
      if (!Number.isInteger(carried) || carried < 0 || carried > 365) {
        res.status(400).json({ error: "Carry-over tidak valid." });
        return;
      }
      data.carried_over = carried;
    }
    if (req.body?.expiresAt !== undefined) {
      const raw = asString(req.body.expiresAt);
      if (raw === undefined) {
        data.expires_at = null;
      } else {
        const parsed = parseDateOnly(raw);
        if (!parsed) {
          res.status(400).json({
            error: "Tanggal kedaluwarsa tidak valid (format YYYY-MM-DD).",
          });
          return;
        }
        data.expires_at = parsed;
      }
    }

    const updated = await prisma.leaveBalance.update({
      where: { id: existing.id },
      data,
      include: { leave_type: true },
    });

    await writeAudit({
      actorId: req.auth?.sub,
      action: "leave.balance.update",
      entity: "LeaveBalance",
      entityId: updated.id,
      oldValues: existing,
      newValues: updated,
      ip: req.ip,
    });

    res.json(serializeBalance(updated));
  },
);

// GET /api/v1/leave/requests
router.get("/requests", async (req: Request, res: Response) => {
  const scope = await employeeScope(req);
  const status = asString(req.query.status)?.toUpperCase();

  const requests = await prisma.leaveRequest.findMany({
    where: {
      employee: { ...scope, deleted_at: null },
      ...(status ? { status } : {}),
    },
    include: leaveRequestInclude,
    orderBy: { created_at: "desc" },
    take: 100,
  });

  res.json(requests.map(serializeLeaveRequest));
});

// GET /api/v1/leave/calendar?month=YYYY-MM
router.get("/calendar", async (req: Request, res: Response) => {
  const scope = await employeeScope(req);
  const { start, end } = monthRange(asString(req.query.month));

  const requests = await prisma.leaveRequest.findMany({
    where: {
      employee: { ...scope, deleted_at: null },
      status: { in: ["PENDING", "APPROVED"] },
      start_date: { lte: end },
      end_date: { gte: start },
    },
    include: leaveRequestInclude,
    orderBy: { start_date: "asc" },
  });

  res.json({
    month: start.toISOString().slice(0, 7),
    days: requests.map((request) => ({
      id: request.id,
      employeeId: request.employee_id,
      employeeName: request.employee.name,
      department: request.employee.department,
      leaveType: request.leave_type.name,
      startDate: request.start_date,
      endDate: request.end_date,
      status: request.status,
      stage: request.stage,
    })),
  });
});

// POST /api/v1/leave/requests (mendukung lampiran multipart)
router.post(
  "/requests",
  (req, res, next) => {
    attachmentUpload.single("attachment")(req, res, (error) => {
      if (error) {
        res.status(400).json({
          error:
            error instanceof Error
              ? error.message
              : "Lampiran tidak valid.",
        });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    const employee = await prisma.employee.findUnique({
      where: { user_id: req.auth!.sub },
      include: { schedule: true },
    });

    if (!employee || employee.deleted_at) {
      res.status(400).json({ error: "Akun ini belum terhubung ke data karyawan." });
      return;
    }

    const leaveTypeId = asString(req.body?.leaveTypeId);
    const range = parseLeaveRange(
      asString(req.body?.startDate),
      asString(req.body?.endDate),
    );
    const reason = asString(req.body?.reason);
    const file = req.file;

    if (!leaveTypeId || !range || !reason) {
      res.status(400).json({
        error: "Jenis cuti, tanggal mulai, tanggal selesai, dan alasan wajib diisi.",
      });
      return;
    }

    if (reason.length > 500) {
      res.status(400).json({ error: "Alasan maksimal 500 karakter." });
      return;
    }

    const { start, end } = range;
    const leaveType = await prisma.leaveType.findUnique({
      where: { id: leaveTypeId },
    });

    if (!leaveType) {
      res.status(404).json({ error: "Jenis cuti tidak ditemukan." });
      return;
    }

    if (leaveType.requires_attachment && !file) {
      res.status(400).json({
        error: `${leaveType.name} memerlukan lampiran (PDF/gambar).`,
      });
      return;
    }

    if (leaveType.min_service_months > 0) {
      const months =
        (start.getUTCFullYear() - employee.join_date.getUTCFullYear()) * 12 +
        (start.getUTCMonth() - employee.join_date.getUTCMonth());
      if (months < leaveType.min_service_months) {
        res.status(400).json({
          error: `${leaveType.name} memerlukan masa kerja minimal ${leaveType.min_service_months} bulan.`,
        });
        return;
      }
    }

    const workDays = parseWorkDays(employee.schedule?.work_days);
    const daysByYear = await workingDaysByYear(start, end, workDays);
    const days = [...daysByYear.values()].reduce(
      (total, yearDays) => total + yearDays,
      0,
    );

    if (days === 0) {
      res.status(400).json({
        error: "Rentang tanggal yang dipilih tidak memuat hari kerja.",
      });
      return;
    }

    const overlapping = await prisma.leaveRequest.findFirst({
      where: {
        employee_id: employee.id,
        status: { in: ["PENDING", "APPROVED"] },
        start_date: { lte: end },
        end_date: { gte: start },
      },
    });

    if (overlapping) {
      res.status(409).json({
        error: "Tanggal cuti bentrok dengan pengajuan lain yang masih aktif.",
      });
      return;
    }

    if (quotaEnforced(leaveType.default_quota)) {
      for (const [year, yearDays] of daysByYear) {
        if (yearDays === 0) continue;

        const balances = await ensureBalances(employee.id, year);
        const balance = balances.find(
          (item) => item.leave_type_id === leaveTypeId,
        );
        if (!balance) continue;

        const remaining = remainingDays(balance);
        if (yearDays > remaining) {
          res.status(400).json({
            error: `Saldo ${leaveType.name} tahun ${year} tidak cukup. Sisa ${remaining} hari, diajukan ${yearDays} hari.`,
          });
          return;
        }
      }
    }

    let attachmentPath: string | null = null;
    let attachmentName: string | null = null;

    if (file) {
      const saved = await saveAttachment(file.buffer, file.mimetype);
      attachmentPath = saved.path;
      attachmentName = file.originalname.replace(/[^\w.\- ]/g, "_").slice(0, 120);
    }

    const managerId = employee.manager_id;
    const stage = managerId ? "MANAGER" : "HR";

    const request = await prisma.leaveRequest.create({
      data: {
        employee_id: employee.id,
        leave_type_id: leaveTypeId,
        start_date: start,
        end_date: end,
        days,
        reason,
        status: "PENDING",
        stage,
        attachment_path: attachmentPath,
        attachment_name: attachmentName,
      },
      include: leaveRequestInclude,
    });

    await writeAudit({
      actorId: req.auth?.sub,
      action: "leave.request.create",
      entity: "LeaveRequest",
      entityId: request.id,
      newValues: request,
      ip: req.ip,
    });

    const managerUser = await managerUserId(managerId);
    const summary = `${employee.name} mengajukan ${leaveType.name} selama ${days} hari (${formatDate(start)} s/d ${formatDate(end)}).`;

    await notifyUserIds([managerUser, ...(await hrUserIds())], {
      title: "Pengajuan cuti baru",
      message: summary,
      type: "LEAVE",
    });

    await emailUserIds(
      [managerUser, ...(await hrUserIds())],
      `Pengajuan ${leaveType.name}: ${employee.name}`,
      `${summary}\n\nAlasan: ${reason}\n\nSilakan buka Montreux HRIS untuk memproses.`,
    );

    res.status(201).json(serializeLeaveRequest(request));
  },
);

// GET /api/v1/leave/requests/:id/attachment
router.get("/requests/:id/attachment", async (req: Request, res: Response) => {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: String(req.params.id) },
    select: {
      employee_id: true,
      attachment_path: true,
      attachment_name: true,
    },
  });

  if (!request?.attachment_path) {
    res.status(404).json({ error: "Lampiran tidak ditemukan." });
    return;
  }

  const employee = await getEmployeeForUser(req.auth?.sub);
  const allowed =
    isHrRole(req.auth?.role) ||
    employee?.id === request.employee_id ||
    (await canReviewEmployee(req, request.employee_id));

  if (!allowed) {
    res.status(403).json({ error: "Anda tidak memiliki akses ke lampiran ini." });
    return;
  }

  const absolute = resolveAttachment(request.attachment_path);
  if (!absolute || !fs.existsSync(absolute)) {
    res.status(404).json({ error: "File lampiran tidak tersedia." });
    return;
  }

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${(request.attachment_name ?? "lampiran").replace(/"/g, "")}"`,
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(absolute);
});

// PATCH /api/v1/leave/requests/:id/decision
router.patch(
  "/requests/:id/decision",
  requireRole("SUPER_ADMIN", "HR_ADMIN", "MANAGER"),
  async (req: Request, res: Response) => {
    const status = asString(req.body?.status)?.toUpperCase();
    const note = asString(req.body?.note);

    if (status !== "APPROVED" && status !== "REJECTED") {
      res.status(400).json({ error: "Status harus APPROVED atau REJECTED." });
      return;
    }

    const existing = await prisma.leaveRequest.findUnique({
      where: { id: String(req.params.id) },
      include: leaveRequestInclude,
    });

    if (!existing) {
      res.status(404).json({ error: "Pengajuan cuti tidak ditemukan." });
      return;
    }

    if (existing.status !== "PENDING") {
      res.status(409).json({
        error: `Pengajuan sudah berstatus ${existing.status} dan tidak bisa diproses lagi.`,
      });
      return;
    }

    const allowed = await canReviewEmployee(req, existing.employee_id);
    if (!allowed) {
      res.status(403).json({
        error: "Anda hanya dapat menyetujui cuti anggota tim Anda.",
      });
      return;
    }

    const actorIsHr = isHrRole(req.auth?.role);
    const actorEmployee = await getEmployeeForUser(req.auth?.sub);

    // Cegah self-approval (termasuk oleh HR yang punya data karyawan).
    if (actorEmployee?.id === existing.employee_id && req.auth?.role !== "SUPER_ADMIN") {
      res.status(403).json({ error: "Anda tidak dapat menyetujui pengajuan sendiri." });
      return;
    }

    // Setelah tahap manager selesai, hanya HR yang boleh memutuskan.
    if (existing.stage === "HR" && !actorIsHr) {
      res.status(403).json({
        error: "Pengajuan ini sedang menunggu persetujuan HR.",
      });
      return;
    }

    const needsHrStage =
      existing.leave_type.requires_hr_approval && existing.stage === "MANAGER";

    // Tahap 1 (manager) selesai tetapi masih perlu persetujuan HR:
    // status tetap PENDING, stage berpindah ke HR.
    if (status === "APPROVED" && needsHrStage && !actorIsHr) {
      const forwarded = await prisma.$transaction(async (tx) => {
        const claimed = await tx.leaveRequest.updateMany({
          where: { id: existing.id, status: "PENDING", stage: "MANAGER" },
          data: {
            stage: "HR",
            reviewer_id: req.auth?.sub ?? null,
            reviewer_note: note ?? null,
          },
        });

        if (claimed.count === 0) return null;

        return tx.leaveRequest.findUnique({
          where: { id: existing.id },
          include: leaveRequestInclude,
        });
      });

      if (!forwarded) {
        res.status(409).json({
          error:
            "Pengajuan sudah diproses oleh pengguna lain. Muat ulang data.",
        });
        return;
      }

      await writeAudit({
        actorId: req.auth?.sub,
        action: "leave.request.forward_hr",
        entity: "LeaveRequest",
        entityId: forwarded.id,
        oldValues: { stage: existing.stage },
        newValues: { stage: forwarded.stage },
        ip: req.ip,
      });

      const hrIds = await hrUserIds();
      await notifyUserIds(hrIds, {
        title: "Cuti menunggu persetujuan HR",
        message: `Pengajuan ${forwarded.leave_type.name} oleh ${forwarded.employee.name} menunggu persetujuan HR.`,
        type: "LEAVE",
      });
      await emailUserIds(
        hrIds,
        `Menunggu persetujuan HR: ${forwarded.employee.name}`,
        `Pengajuan ${forwarded.leave_type.name} (${forwarded.days} hari) telah disetujui atasan langsung dan menunggu persetujuan HR.`,
      );

      res.json(serializeLeaveRequest(forwarded));
      return;
    }

    const enforceQuota = quotaEnforced(existing.leave_type.default_quota);
    let allocations = new Map<number, number>();

    if (status === "APPROVED") {
      const workDays = parseWorkDays(existing.employee.schedule?.work_days);
      const daysByYear = await workingDaysByYear(
        existing.start_date,
        existing.end_date,
        workDays,
      );
      allocations = allocateDaysByYear(existing.days, daysByYear);

      if (allocations.size === 0) {
        allocations.set(existing.start_date.getUTCFullYear(), existing.days);
      }

      if (enforceQuota) {
        for (const [year, days] of allocations) {
          if (days <= 0) continue;

          const balances = await ensureBalances(existing.employee_id, year);
          const balance = balances.find(
            (item) => item.leave_type_id === existing.leave_type_id,
          );
          const remaining = balance ? remainingDays(balance) : 0;

          if (!balance || days > remaining) {
            res.status(400).json({
              error: `Saldo cuti tahun ${year} tidak cukup. Sisa ${remaining} hari, dibutuhkan ${days} hari.`,
            });
            return;
          }
        }
      }
    }

    let updated: LeaveRequestWithRelations | null;
    try {
      updated = await prisma.$transaction(async (tx) => {
        // Klaim pengajuan secara atomik supaya dua approver tidak bisa
        // memproses pengajuan yang sama (dan memotong saldo dua kali).
        const claimed = await tx.leaveRequest.updateMany({
          where: {
            id: existing.id,
            status: "PENDING",
            stage: existing.stage,
          },
          data: {
            status,
            stage: status === "APPROVED" ? "DONE" : existing.stage,
            reviewer_id: req.auth?.sub ?? null,
            reviewer_note: note ?? null,
            decided_at: new Date(),
          },
        });

        if (claimed.count === 0) throw new LeaveConflictError();

        if (status === "APPROVED" && enforceQuota) {
          for (const [year, days] of allocations) {
            if (days <= 0) continue;

            const balance = await tx.leaveBalance.findUnique({
              where: {
                employee_id_leave_type_id_year: {
                  employee_id: existing.employee_id,
                  leave_type_id: existing.leave_type_id,
                  year,
                },
              },
              include: { leave_type: true },
            });

            if (!balance) {
              throw new LeaveBalanceError(
                `Saldo cuti tahun ${year} belum tersedia.`,
              );
            }

            if (remainingDays(balance) < days) {
              throw new LeaveBalanceError(
                `Saldo cuti tahun ${year} tidak cukup.`,
              );
            }

            // Optimistic lock: gagal bila saldo berubah sejak dibaca.
            const applied = await tx.leaveBalance.updateMany({
              where: { id: balance.id, used: balance.used },
              data: { used: { increment: days } },
            });

            if (applied.count !== 1) throw new LeaveConflictError();
          }
        }

        return tx.leaveRequest.findUnique({
          where: { id: existing.id },
          include: leaveRequestInclude,
        });
      });
    } catch (error) {
      if (error instanceof LeaveConflictError) {
        res.status(409).json({
          error:
            "Pengajuan atau saldo cuti sudah berubah. Muat ulang data dan coba lagi.",
        });
        return;
      }

      if (error instanceof LeaveBalanceError) {
        res.status(400).json({ error: error.message });
        return;
      }

      throw error;
    }

    if (!updated) {
      res.status(409).json({
        error: "Pengajuan sudah tidak tersedia. Muat ulang data.",
      });
      return;
    }

    await writeAudit({
      actorId: req.auth?.sub,
      action:
        status === "APPROVED" ? "leave.request.approve" : "leave.request.reject",
      entity: "LeaveRequest",
      entityId: updated.id,
      oldValues: { status: existing.status, stage: existing.stage },
      newValues: { status: updated.status, stage: updated.stage, note },
      ip: req.ip,
    });

    const title = status === "APPROVED" ? "Cuti disetujui" : "Cuti ditolak";
    const detail = `Pengajuan ${updated.leave_type.name} (${updated.days} hari) telah ${
      status === "APPROVED" ? "disetujui" : "ditolak"
    }.${note ? ` Catatan: ${note}` : ""}`;

    await notifyUserIds([updated.employee.user_id], {
      title,
      message: detail,
      type: "LEAVE",
    });
    await emailUserIds(
      [updated.employee.user_id],
      `${title}: ${updated.leave_type.name}`,
      detail,
    );

    res.json(serializeLeaveRequest(updated));
  },
);

// PATCH /api/v1/leave/requests/:id/cancel
router.patch("/requests/:id/cancel", async (req: Request, res: Response) => {
  const employee = await getEmployeeForUser(req.auth?.sub);

  if (!employee) {
    res.status(400).json({ error: "Akun ini belum terhubung ke data karyawan." });
    return;
  }

  const existing = await prisma.leaveRequest.findUnique({
    where: { id: String(req.params.id) },
  });

  if (!existing) {
    res.status(404).json({ error: "Pengajuan cuti tidak ditemukan." });
    return;
  }

  if (existing.employee_id !== employee.id && !isHrRole(req.auth?.role)) {
    res.status(403).json({ error: "Anda hanya dapat membatalkan pengajuan sendiri." });
    return;
  }

  if (existing.status !== "PENDING") {
    res.status(409).json({
      error: "Hanya pengajuan berstatus PENDING yang bisa dibatalkan.",
    });
    return;
  }

  const updated = await prisma.leaveRequest.update({
    where: { id: existing.id },
    data: { status: "CANCELLED", decided_at: new Date() },
    include: leaveRequestInclude,
  });

  await writeAudit({
    actorId: req.auth?.sub,
    action: "leave.request.cancel",
    entity: "LeaveRequest",
    entityId: updated.id,
    oldValues: { status: existing.status },
    newValues: { status: updated.status },
    ip: req.ip,
  });

  res.json(serializeLeaveRequest(updated));
});

export default router;
