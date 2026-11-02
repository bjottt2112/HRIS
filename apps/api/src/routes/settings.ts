import { Router, type Request, type Response } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asString } from "../lib/validation";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../lib/audit";
import { parseDateOnly } from "../lib/hr";
import { parseWorkDays } from "../lib/leave-policy";

const router = Router();

router.use(requireAuth);

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const HOLIDAY_TYPES = new Set(["NATIONAL", "COLLECTIVE", "COMPANY"]);

function parseNumber(value: unknown, min: number, max: number): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < min || parsed > max) return null;
  return parsed;
}

// GET /api/v1/settings/bootstrap — semua konfigurasi HR dalam satu request.
router.get("/bootstrap", async (_req: Request, res: Response) => {
  const [schedules, locations, holidays, leaveTypes] = await Promise.all([
    prisma.workSchedule.findMany({ orderBy: { name: "asc" } }),
    prisma.workLocation.findMany({ orderBy: { name: "asc" } }),
    prisma.holiday.findMany({
      where: { date: { gte: new Date(Date.UTC(new Date().getUTCFullYear() - 1, 0, 1)) } },
      orderBy: { date: "asc" },
    }),
    prisma.leaveType.findMany({ orderBy: { code: "asc" } }),
  ]);

  res.json({ schedules, locations, holidays, leaveTypes });
});

// ---------- Jadwal kerja ----------

router.get("/schedules", async (_req: Request, res: Response) => {
  res.json(await prisma.workSchedule.findMany({ orderBy: { name: "asc" } }));
});

router.post(
  "/schedules",
  requireRole("SUPER_ADMIN", "HR_ADMIN"),
  async (req: Request, res: Response) => {
    const name = asString(req.body?.name);
    const startTime = asString(req.body?.startTime) ?? "09:00";
    const endTime = asString(req.body?.endTime) ?? "17:00";
    const tolerance = Number(req.body?.lateToleranceMinutes ?? 0);
    const workDays = asString(req.body?.workDays) ?? "1,2,3,4,5";

    if (!name) {
      res.status(400).json({ error: "Nama jadwal wajib diisi." });
      return;
    }
    if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
      res.status(400).json({ error: "Format jam harus HH:MM." });
      return;
    }
    if (!Number.isInteger(tolerance) || tolerance < 0 || tolerance > 180) {
      res.status(400).json({ error: "Toleransi keterlambatan 0–180 menit." });
      return;
    }

    const schedule = await prisma.workSchedule.create({
      data: {
        name,
        start_time: startTime,
        end_time: endTime,
        late_tolerance_minutes: tolerance,
        work_days: [...parseWorkDays(workDays)].join(","),
      },
    });

    await writeAudit({
      actorId: req.auth?.sub,
      action: "schedule.create",
      entity: "WorkSchedule",
      entityId: schedule.id,
      newValues: schedule,
      ip: req.ip,
    });

    res.status(201).json(schedule);
  },
);

router.patch(
  "/schedules/:id",
  requireRole("SUPER_ADMIN", "HR_ADMIN"),
  async (req: Request, res: Response) => {
    const existing = await prisma.workSchedule.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!existing) {
      res.status(404).json({ error: "Jadwal tidak ditemukan." });
      return;
    }

    const data: Prisma.WorkScheduleUpdateInput = {};
    const name = asString(req.body?.name);
    if (name) data.name = name;

    const startTime = asString(req.body?.startTime);
    if (startTime) {
      if (!TIME_PATTERN.test(startTime)) {
        res.status(400).json({ error: "Format jam harus HH:MM." });
        return;
      }
      data.start_time = startTime;
    }

    const endTime = asString(req.body?.endTime);
    if (endTime) {
      if (!TIME_PATTERN.test(endTime)) {
        res.status(400).json({ error: "Format jam harus HH:MM." });
        return;
      }
      data.end_time = endTime;
    }

    if (req.body?.lateToleranceMinutes !== undefined) {
      const tolerance = Number(req.body.lateToleranceMinutes);
      if (!Number.isInteger(tolerance) || tolerance < 0 || tolerance > 180) {
        res.status(400).json({ error: "Toleransi keterlambatan 0–180 menit." });
        return;
      }
      data.late_tolerance_minutes = tolerance;
    }

    const workDays = asString(req.body?.workDays);
    if (workDays) data.work_days = [...parseWorkDays(workDays)].join(",");

    const updated = await prisma.workSchedule.update({
      where: { id: existing.id },
      data,
    });

    await writeAudit({
      actorId: req.auth?.sub,
      action: "schedule.update",
      entity: "WorkSchedule",
      entityId: updated.id,
      oldValues: existing,
      newValues: updated,
      ip: req.ip,
    });

    res.json(updated);
  },
);

router.delete(
  "/schedules/:id",
  requireRole("SUPER_ADMIN", "HR_ADMIN"),
  async (req: Request, res: Response) => {
    const existing = await prisma.workSchedule.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!existing) {
      res.status(404).json({ error: "Jadwal tidak ditemukan." });
      return;
    }

    await prisma.workSchedule.delete({ where: { id: existing.id } });
    await writeAudit({
      actorId: req.auth?.sub,
      action: "schedule.delete",
      entity: "WorkSchedule",
      entityId: existing.id,
      oldValues: existing,
      ip: req.ip,
    });

    res.json({ ok: true });
  },
);

// ---------- Lokasi kerja (geofence) ----------

router.get("/locations", async (_req: Request, res: Response) => {
  res.json(await prisma.workLocation.findMany({ orderBy: { name: "asc" } }));
});

router.post(
  "/locations",
  requireRole("SUPER_ADMIN", "HR_ADMIN"),
  async (req: Request, res: Response) => {
    const name = asString(req.body?.name);
    const latitude = parseNumber(req.body?.latitude, -90, 90);
    const longitude = parseNumber(req.body?.longitude, -180, 180);
    const radius = parseNumber(req.body?.radiusMeters, 10, 10_000);

    if (!name || latitude === null || longitude === null || radius === null) {
      res.status(400).json({
        error:
          "Nama, latitude (-90..90), longitude (-180..180), dan radius (10–10000 m) wajib valid.",
      });
      return;
    }

    const location = await prisma.workLocation.create({
      data: {
        name,
        latitude,
        longitude,
        radius_meters: Math.round(radius),
        allow_wfh: req.body?.allowWfh !== false,
      },
    });

    await writeAudit({
      actorId: req.auth?.sub,
      action: "location.create",
      entity: "WorkLocation",
      entityId: location.id,
      newValues: location,
      ip: req.ip,
    });

    res.status(201).json(location);
  },
);

router.patch(
  "/locations/:id",
  requireRole("SUPER_ADMIN", "HR_ADMIN"),
  async (req: Request, res: Response) => {
    const existing = await prisma.workLocation.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!existing) {
      res.status(404).json({ error: "Lokasi tidak ditemukan." });
      return;
    }

    const data: Prisma.WorkLocationUpdateInput = {};
    const name = asString(req.body?.name);
    if (name) data.name = name;

    if (req.body?.latitude !== undefined) {
      const latitude = parseNumber(req.body.latitude, -90, 90);
      if (latitude === null) {
        res.status(400).json({ error: "Latitude tidak valid." });
        return;
      }
      data.latitude = latitude;
    }

    if (req.body?.longitude !== undefined) {
      const longitude = parseNumber(req.body.longitude, -180, 180);
      if (longitude === null) {
        res.status(400).json({ error: "Longitude tidak valid." });
        return;
      }
      data.longitude = longitude;
    }

    if (req.body?.radiusMeters !== undefined) {
      const radius = parseNumber(req.body.radiusMeters, 10, 10_000);
      if (radius === null) {
        res.status(400).json({ error: "Radius tidak valid." });
        return;
      }
      data.radius_meters = Math.round(radius);
    }

    if (req.body?.allowWfh !== undefined) data.allow_wfh = Boolean(req.body.allowWfh);

    const updated = await prisma.workLocation.update({
      where: { id: existing.id },
      data,
    });

    await writeAudit({
      actorId: req.auth?.sub,
      action: "location.update",
      entity: "WorkLocation",
      entityId: updated.id,
      oldValues: existing,
      newValues: updated,
      ip: req.ip,
    });

    res.json(updated);
  },
);

router.delete(
  "/locations/:id",
  requireRole("SUPER_ADMIN", "HR_ADMIN"),
  async (req: Request, res: Response) => {
    const existing = await prisma.workLocation.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!existing) {
      res.status(404).json({ error: "Lokasi tidak ditemukan." });
      return;
    }

    await prisma.workLocation.delete({ where: { id: existing.id } });
    await writeAudit({
      actorId: req.auth?.sub,
      action: "location.delete",
      entity: "WorkLocation",
      entityId: existing.id,
      oldValues: existing,
      ip: req.ip,
    });

    res.json({ ok: true });
  },
);

// ---------- Hari libur ----------

router.get("/holidays", async (req: Request, res: Response) => {
  const year = Number(req.query.year);
  const validYear = Number.isInteger(year) && year >= 2000 && year <= 2100;

  res.json(
    await prisma.holiday.findMany({
      where: validYear
        ? {
            date: {
              gte: new Date(Date.UTC(year, 0, 1)),
              lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59)),
            },
          }
        : undefined,
      orderBy: { date: "asc" },
    }),
  );
});

router.post(
  "/holidays",
  requireRole("SUPER_ADMIN", "HR_ADMIN"),
  async (req: Request, res: Response) => {
    const date = parseDateOnly(asString(req.body?.date));
    const name = asString(req.body?.name);
    const type = (asString(req.body?.type) ?? "NATIONAL").toUpperCase();

    if (!date || !name) {
      res.status(400).json({ error: "Tanggal dan nama hari libur wajib diisi." });
      return;
    }
    if (!HOLIDAY_TYPES.has(type)) {
      res.status(400).json({ error: "Tipe hari libur tidak valid." });
      return;
    }

    const existing = await prisma.holiday.findUnique({ where: { date } });
    if (existing) {
      res.status(409).json({ error: "Tanggal tersebut sudah terdaftar sebagai hari libur." });
      return;
    }

    const holiday = await prisma.holiday.create({
      data: { date, name, type },
    });

    await writeAudit({
      actorId: req.auth?.sub,
      action: "holiday.create",
      entity: "Holiday",
      entityId: holiday.id,
      newValues: holiday,
      ip: req.ip,
    });

    res.status(201).json(holiday);
  },
);

router.delete(
  "/holidays/:id",
  requireRole("SUPER_ADMIN", "HR_ADMIN"),
  async (req: Request, res: Response) => {
    const existing = await prisma.holiday.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!existing) {
      res.status(404).json({ error: "Hari libur tidak ditemukan." });
      return;
    }

    await prisma.holiday.delete({ where: { id: existing.id } });
    await writeAudit({
      actorId: req.auth?.sub,
      action: "holiday.delete",
      entity: "Holiday",
      entityId: existing.id,
      oldValues: existing,
      ip: req.ip,
    });

    res.json({ ok: true });
  },
);

// ---------- Jenis cuti & kebijakan ----------

router.get("/leave-types", async (_req: Request, res: Response) => {
  res.json(await prisma.leaveType.findMany({ orderBy: { code: "asc" } }));
});

router.post(
  "/leave-types",
  requireRole("SUPER_ADMIN", "HR_ADMIN"),
  async (req: Request, res: Response) => {
    const code = asString(req.body?.code)?.toUpperCase();
    const name = asString(req.body?.name);
    const quota = Number(req.body?.defaultQuota ?? 12);
    const carryOverMax = Number(req.body?.carryOverMax ?? 0);
    const minService = Number(req.body?.minServiceMonths ?? 0);

    if (!code || !name) {
      res.status(400).json({ error: "Kode dan nama jenis cuti wajib diisi." });
      return;
    }
    if (!/^[A-Z0-9_]{2,20}$/.test(code)) {
      res.status(400).json({ error: "Kode harus 2–20 huruf/angka/underscore." });
      return;
    }
    if (!Number.isInteger(quota) || quota < 0 || quota > 365) {
      res.status(400).json({ error: "Kuota tidak valid." });
      return;
    }
    if (!Number.isInteger(carryOverMax) || carryOverMax < 0 || carryOverMax > 365) {
      res.status(400).json({ error: "Batas carry-over tidak valid." });
      return;
    }
    if (!Number.isInteger(minService) || minService < 0 || minService > 120) {
      res.status(400).json({ error: "Masa kerja minimum tidak valid." });
      return;
    }

    const existing = await prisma.leaveType.findUnique({ where: { code } });
    if (existing) {
      res.status(409).json({ error: "Kode jenis cuti sudah dipakai." });
      return;
    }

    const leaveType = await prisma.leaveType.create({
      data: {
        code,
        name,
        default_quota: quota,
        requires_attachment: Boolean(req.body?.requiresAttachment),
        requires_hr_approval: Boolean(req.body?.requiresHrApproval),
        carry_over_max: carryOverMax,
        min_service_months: minService,
      },
    });

    await writeAudit({
      actorId: req.auth?.sub,
      action: "leave_type.create",
      entity: "LeaveType",
      entityId: leaveType.id,
      newValues: leaveType,
      ip: req.ip,
    });

    res.status(201).json(leaveType);
  },
);

router.patch(
  "/leave-types/:id",
  requireRole("SUPER_ADMIN", "HR_ADMIN"),
  async (req: Request, res: Response) => {
    const existing = await prisma.leaveType.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!existing) {
      res.status(404).json({ error: "Jenis cuti tidak ditemukan." });
      return;
    }

    const data: Prisma.LeaveTypeUpdateInput = {};
    const name = asString(req.body?.name);
    if (name) data.name = name;

    for (const [key, field, min, max] of [
      ["defaultQuota", "default_quota", 0, 365],
      ["carryOverMax", "carry_over_max", 0, 365],
      ["minServiceMonths", "min_service_months", 0, 120],
    ] as const) {
      if (req.body?.[key] === undefined) continue;
      const value = Number(req.body[key]);
      if (!Number.isInteger(value) || value < min || value > max) {
        res.status(400).json({ error: `Nilai ${key} tidak valid.` });
        return;
      }
      data[field] = value;
    }

    if (req.body?.requiresAttachment !== undefined) {
      data.requires_attachment = Boolean(req.body.requiresAttachment);
    }
    if (req.body?.requiresHrApproval !== undefined) {
      data.requires_hr_approval = Boolean(req.body.requiresHrApproval);
    }

    const updated = await prisma.leaveType.update({
      where: { id: existing.id },
      data,
    });

    await writeAudit({
      actorId: req.auth?.sub,
      action: "leave_type.update",
      entity: "LeaveType",
      entityId: updated.id,
      oldValues: existing,
      newValues: updated,
      ip: req.ip,
    });

    res.json(updated);
  },
);

export default router;
