import { Router, type Request, type Response } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { getOrCreateCompany } from "../lib/company";
import { asString } from "../lib/validation";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../lib/audit";
import { importUpload } from "../lib/uploads";
import {
  readSpreadsheet,
  sendCsv,
  sendXlsx,
  type CellValue,
} from "../lib/spreadsheet";
import {
  canViewSensitive,
  employeeScope,
  parseDateOnly,
  serializeEmployee,
} from "../lib/hr";

const router = Router();

router.use(requireAuth);

const ALLOWED_STATUS = new Set(["Active", "On Leave", "Inactive"]);
const ALLOWED_SORT = new Set([
  "name",
  "department",
  "role",
  "status",
  "join_date",
  "created_at",
]);

function parseOptionalDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  const text = asString(value);
  if (!text) return null;
  return parseDateOnly(text);
}

/**
 * Apakah menjadikan `managerId` sebagai atasan `employeeId` akan membuat
 * siklus hierarki (mis. atasan dipilih dari bawahannya sendiri).
 */
async function wouldCreateManagerCycle(
  employeeId: string,
  managerId: string,
): Promise<boolean> {
  const visited = new Set<string>();
  let current: string | null = managerId;

  while (current) {
    if (current === employeeId) return true;
    if (visited.has(current)) return true;
    visited.add(current);

    const node: { manager_id: string | null } | null =
      await prisma.employee.findUnique({
        where: { id: current },
        select: { manager_id: true },
      });
    current = node?.manager_id ?? null;
  }

  return false;
}

// GET /api/v1/employees
router.get("/", async (req: Request, res: Response) => {
  const scope = await employeeScope(req);
  const q = asString(req.query.q);
  const department = asString(req.query.department);
  const status = asString(req.query.status);
  const sortKey = asString(req.query.sort) ?? "name";
  const sort = ALLOWED_SORT.has(sortKey) ? sortKey : "name";
  const order = asString(req.query.order) === "desc" ? "desc" : "asc";

  const where: Prisma.EmployeeWhereInput = {
    deleted_at: null,
    ...scope,
    ...(department ? { department } : {}),
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { role: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const employees = await prisma.employee.findMany({
    where,
    orderBy: { [sort]: order },
  });

  const sensitive = canViewSensitive(req.auth?.role);
  res.json(employees.map((employee) => serializeEmployee(employee, sensitive)));
});

type ImportColumn =
  | "nik"
  | "name"
  | "email"
  | "department"
  | "role"
  | "status"
  | "employment"
  | "location"
  | "joinDate"
  | "exitDate"
  | "phone"
  | "address"
  | "emergencyName"
  | "emergencyPhone"
  | "npwp"
  | "bpjs"
  | "bankAccount"
  | "managerEmail"
  | "schedule"
  | "workLocation";

const IMPORT_COLUMNS: Array<{ key: ImportColumn; label: string }> = [
  { key: "nik", label: "NIK" },
  { key: "name", label: "Nama" },
  { key: "email", label: "Email" },
  { key: "department", label: "Departemen" },
  { key: "role", label: "Jabatan" },
  { key: "status", label: "Status Karyawan" },
  { key: "employment", label: "Tipe Kerja" },
  { key: "location", label: "Lokasi" },
  { key: "joinDate", label: "Tanggal Masuk" },
  { key: "exitDate", label: "Tanggal Keluar" },
  { key: "phone", label: "Telepon" },
  { key: "address", label: "Alamat" },
  { key: "emergencyName", label: "Nama Darurat" },
  { key: "emergencyPhone", label: "Telepon Darurat" },
  { key: "npwp", label: "NPWP" },
  { key: "bpjs", label: "BPJS" },
  { key: "bankAccount", label: "Rekening Bank" },
  { key: "managerEmail", label: "Email Atasan" },
  { key: "schedule", label: "Jadwal" },
  { key: "workLocation", label: "Lokasi Kerja" },
];

const HEADER_ALIASES: Record<string, ImportColumn> = {
  nik: "nik",
  nama: "name",
  name: "name",
  email: "email",
  departemen: "department",
  department: "department",
  jabatan: "role",
  role: "role",
  statuskaryawan: "status",
  status: "status",
  tipekerja: "employment",
  employment: "employment",
  lokasi: "location",
  location: "location",
  tanggalmasuk: "joinDate",
  joindate: "joinDate",
  tanggalkeluar: "exitDate",
  exitdate: "exitDate",
  telepon: "phone",
  phone: "phone",
  alamat: "address",
  address: "address",
  namadarurat: "emergencyName",
  emergencyname: "emergencyName",
  telepondarurat: "emergencyPhone",
  emergencyphone: "emergencyPhone",
  npwp: "npwp",
  bpjs: "bpjs",
  rekeningbank: "bankAccount",
  bankaccount: "bankAccount",
  emailatasan: "managerEmail",
  manageremail: "managerEmail",
  jadwal: "schedule",
  schedule: "schedule",
  lokasikerja: "workLocation",
  worklocation: "workLocation",
};

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseFlexibleDate(value: string | undefined): Date | null | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return parseDateOnly(value) ?? null;
  }
  const match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return parseDateOnly(
      `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
    ) ?? null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

type ImportRow = {
  line: number;
  action: "create" | "update" | "error";
  employeeId: string | null;
  errors: string[];
  data: {
    nik: string;
    name: string;
    email: string;
    department: string;
    role: string;
    status: string;
    employment: string;
    location: string;
    joinDate: Date;
    exitDate: Date | null;
    phone: string | null;
    address: string | null;
    emergencyName: string | null;
    emergencyPhone: string | null;
    npwp: string | null;
    bpjs: string | null;
    bankAccount: string | null;
    managerId: string | null;
    scheduleId: string | null;
    workLocationId: string | null;
    changedJob: boolean;
  };
};

async function buildImportPlan(buffer: Buffer, filename: string): Promise<{
  headers: string[];
  rows: ImportRow[];
  missingColumns: string[];
}> {
  const matrix = await readSpreadsheet(buffer, filename);
  if (matrix.length === 0) {
    return { headers: [], rows: [], missingColumns: ["header"] };
  }

  const headerRow = matrix[0];
  const columnIndex = new Map<ImportColumn, number>();

  headerRow.forEach((header, index) => {
    const key = HEADER_ALIASES[normalizeHeader(header)];
    if (key && !columnIndex.has(key)) columnIndex.set(key, index);
  });

  const missingColumns = (["nik", "name", "email"] as ImportColumn[]).filter(
    (key) => !columnIndex.has(key),
  );

  if (missingColumns.length > 0) {
    return { headers: headerRow, rows: [], missingColumns };
  }

  const [employees, schedules, locations] = await Promise.all([
    prisma.employee.findMany({
      where: { deleted_at: null },
      select: { id: true, nik: true, email: true, department: true, role: true },
    }),
    prisma.workSchedule.findMany({ select: { id: true, name: true } }),
    prisma.workLocation.findMany({ select: { id: true, name: true } }),
  ]);

  const byNik = new Map(employees.map((item) => [item.nik, item]));
  const byEmail = new Map(
    employees.map((item) => [item.email.toLowerCase(), item]),
  );
  const scheduleByName = new Map(
    schedules.map((item) => [item.name.toLowerCase(), item]),
  );
  const locationByName = new Map(
    locations.map((item) => [item.name.toLowerCase(), item]),
  );

  const rows: ImportRow[] = [];

  for (let index = 1; index < matrix.length; index += 1) {
    const cells = matrix[index];
    if (!cells || cells.every((cell) => !cell.trim())) continue;

    const read = (key: ImportColumn): string => {
      const position = columnIndex.get(key);
      if (position === undefined) return "";
      return (cells[position] ?? "").trim();
    };

    const errors: string[] = [];
    const nik = read("nik");
    const name = read("name");
    const email = read("email").toLowerCase();

    if (!nik) errors.push("NIK wajib diisi.");
    if (!name) errors.push("Nama wajib diisi.");
    if (!email) errors.push("Email wajib diisi.");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push("Format email tidak valid.");
    }

    const byNikMatch = nik ? byNik.get(nik) : undefined;
    const byEmailMatch = email ? byEmail.get(email) : undefined;

    if (byNikMatch && byEmailMatch && byNikMatch.id !== byEmailMatch.id) {
      errors.push("NIK dan email sudah dipakai karyawan yang berbeda.");
    }

    const existing = byNikMatch ?? byEmailMatch;

    if (existing && existing.nik !== nik) {
      errors.push(`NIK sudah dipakai oleh karyawan lain (${existing.nik}).`);
    }
    if (existing && existing.email.toLowerCase() !== email) {
      errors.push(`Email sudah dipakai oleh karyawan lain (${existing.email}).`);
    }

    const statusInput = read("status") || "Active";
    const status = ALLOWED_STATUS.has(statusInput) ? statusInput : "Active";
    if (read("status") && !ALLOWED_STATUS.has(statusInput)) {
      errors.push("Status karyawan harus Active, On Leave, atau Inactive.");
    }

    const joinInput = read("joinDate");
    const joinDate = parseFlexibleDate(joinInput);
    if (joinDate === null) errors.push("Tanggal masuk tidak valid (YYYY-MM-DD).");

    const exitInput = read("exitDate");
    const exitDate = parseFlexibleDate(exitInput);
    if (exitDate === null) errors.push("Tanggal keluar tidak valid (YYYY-MM-DD).");

    let managerId: string | null = null;
    const managerEmail = read("managerEmail").toLowerCase();
    if (managerEmail) {
      const manager = byEmail.get(managerEmail);
      if (!manager) errors.push(`Atasan dengan email ${managerEmail} tidak ditemukan.`);
      else if (manager.email.toLowerCase() === email) {
        errors.push("Karyawan tidak bisa menjadi atasan dirinya sendiri.");
      } else {
        managerId = manager.id;
      }
    }

    let scheduleId: string | null = null;
    const scheduleName = read("schedule").toLowerCase();
    if (scheduleName) {
      const schedule = scheduleByName.get(scheduleName);
      if (!schedule) errors.push(`Jadwal "${read("schedule")}" tidak ditemukan.`);
      else scheduleId = schedule.id;
    }

    let workLocationId: string | null = null;
    const workLocationName = read("workLocation").toLowerCase();
    if (workLocationName) {
      const location = locationByName.get(workLocationName);
      if (!location) {
        errors.push(`Lokasi kerja "${read("workLocation")}" tidak ditemukan.`);
      } else {
        workLocationId = location.id;
      }
    }

    const department = read("department") || existing?.department || "General";
    const role = read("role") || existing?.role || "Staff";
    const changedJob =
      !existing ||
      existing.department !== department ||
      existing.role !== role;

    rows.push({
      line: index + 1,
      action: errors.length > 0 ? "error" : existing ? "update" : "create",
      employeeId: existing?.id ?? null,
      errors,
      data: {
        nik,
        name,
        email,
        department,
        role,
        status,
        employment: read("employment") || "Full-time",
        location: read("location") || "Jakarta, ID",
        joinDate: joinDate instanceof Date ? joinDate : new Date(),
        exitDate: exitDate instanceof Date ? exitDate : null,
        phone: read("phone") || null,
        address: read("address") || null,
        emergencyName: read("emergencyName") || null,
        emergencyPhone: read("emergencyPhone") || null,
        npwp: read("npwp") || null,
        bpjs: read("bpjs") || null,
        bankAccount: read("bankAccount") || null,
        managerId,
        scheduleId,
        workLocationId,
        changedJob,
      },
    });
  }

  return { headers: headerRow, rows, missingColumns };
}

function importSummary(rows: ImportRow[]) {
  return {
    total: rows.length,
    createCount: rows.filter((row) => row.action === "create").length,
    updateCount: rows.filter((row) => row.action === "update").length,
    errorCount: rows.filter((row) => row.action === "error").length,
  };
}

function previewEmployeeRows(rows: ImportRow[]) {
  return rows.map((row) => ({
    line: row.line,
    action: row.action,
    employeeId: row.employeeId,
    nik: row.data.nik,
    name: row.data.name,
    email: row.data.email,
    department: row.data.department,
    role: row.data.role,
    errors: row.errors,
  }));
}

// GET /api/v1/employees/export?format=csv|xlsx
router.get(
  "/export",
  requireRole("SUPER_ADMIN", "HR_ADMIN"),
  async (req: Request, res: Response) => {
    const format = (asString(req.query.format) ?? "csv").toLowerCase();
    const employees = await prisma.employee.findMany({
      where: { deleted_at: null },
      orderBy: { name: "asc" },
    });

    const headers = IMPORT_COLUMNS.map((column) => column.label);
    const rows: CellValue[][] = employees.map((employee) => [
      employee.nik,
      employee.name,
      employee.email,
      employee.department,
      employee.role,
      employee.status,
      employee.employment,
      employee.location,
      employee.join_date.toISOString().slice(0, 10),
      employee.exit_date?.toISOString().slice(0, 10) ?? "",
      employee.phone,
      employee.address,
      employee.emergency_name,
      employee.emergency_phone,
      employee.npwp,
      employee.bpjs,
      employee.bank_account,
      "",
      "",
      "",
    ]);

    await writeAudit({
      actorId: req.auth?.sub,
      action: "employee.export",
      entity: "Employee",
      newValues: { format, count: employees.length },
      ip: req.ip,
    });

    if (format === "xlsx") {
      await sendXlsx(res, "karyawan.xlsx", "Karyawan", headers, rows);
      return;
    }

    sendCsv(res, "karyawan.csv", headers, rows);
  },
);

// GET /api/v1/employees/import/template?format=csv|xlsx
router.get(
  "/import/template",
  requireRole("SUPER_ADMIN", "HR_ADMIN"),
  async (req: Request, res: Response) => {
    const format = (asString(req.query.format) ?? "xlsx").toLowerCase();
    const headers = IMPORT_COLUMNS.map((column) => column.label);

    if (format === "csv") {
      sendCsv(res, "template-karyawan.csv", headers, []);
      return;
    }

    await sendXlsx(res, "template-karyawan.xlsx", "Karyawan", headers, []);
  },
);

// POST /api/v1/employees/import/preview
router.post(
  "/import/preview",
  requireRole("SUPER_ADMIN", "HR_ADMIN"),
  (req, res, next) => {
    importUpload.single("file")(req, res, (error) => {
      if (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : "File tidak valid." });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "File CSV/XLSX wajib diunggah." });
      return;
    }

    try {
      const plan = await buildImportPlan(req.file.buffer, req.file.originalname);

      if (plan.missingColumns.length > 0) {
        res.status(400).json({
          error: `Kolom wajib tidak ditemukan: ${plan.missingColumns.join(", ")}.`,
          headers: plan.headers,
        });
        return;
      }

      res.json({
        ...importSummary(plan.rows),
        rows: previewEmployeeRows(plan.rows),
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Gagal membaca file.",
      });
    }
  },
);

// POST /api/v1/employees/import/commit
router.post(
  "/import/commit",
  requireRole("SUPER_ADMIN", "HR_ADMIN"),
  (req, res, next) => {
    importUpload.single("file")(req, res, (error) => {
      if (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : "File tidak valid." });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "File CSV/XLSX wajib diunggah." });
      return;
    }

    let plan;
    try {
      plan = await buildImportPlan(req.file.buffer, req.file.originalname);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Gagal membaca file.",
      });
      return;
    }

    if (plan.missingColumns.length > 0) {
      res.status(400).json({
        error: `Kolom wajib tidak ditemukan: ${plan.missingColumns.join(", ")}.`,
      });
      return;
    }

    const company = await getOrCreateCompany();
    let created = 0;
    let updated = 0;
    const skipped: Array<{ line: number; errors: string[] }> = [];

    for (const row of plan.rows) {
      if (row.action === "error") {
        skipped.push({ line: row.line, errors: row.errors });
        continue;
      }

      const { data } = row;

      try {
        if (row.action === "update" && row.employeeId) {
          const employeeId = row.employeeId;
          const updateData: Prisma.EmployeeUncheckedUpdateInput = {
            nik: data.nik,
            name: data.name,
            email: data.email,
            department: data.department,
            role: data.role,
            status: data.status,
            employment: data.employment,
            location: data.location,
            join_date: data.joinDate,
            exit_date: data.exitDate,
            phone: data.phone,
            address: data.address,
            emergency_name: data.emergencyName,
            emergency_phone: data.emergencyPhone,
            npwp: data.npwp,
            bpjs: data.bpjs,
            bank_account: data.bankAccount,
            manager_id: data.managerId,
            schedule_id: data.scheduleId,
            work_location_id: data.workLocationId,
            updated_at: new Date(),
          };

          await prisma.$transaction(async (tx) => {
            await tx.employee.update({
              where: { id: employeeId },
              data: updateData,
            });

            if (data.changedJob) {
              await tx.employmentHistory.create({
                data: {
                  employee_id: employeeId,
                  department: data.department,
                  role: data.role,
                  effective_date: new Date(),
                  reason: "Import karyawan",
                },
              });
            }
          });

          updated += 1;
        } else {
          await prisma.$transaction(async (tx) => {
            const employee = await tx.employee.create({
              data: {
                company_id: company.id,
                nik: data.nik,
                name: data.name,
                email: data.email,
                department: data.department,
                role: data.role,
                status: data.status,
                employment: data.employment,
                location: data.location,
                join_date: data.joinDate,
                exit_date: data.exitDate,
                phone: data.phone,
                address: data.address,
                emergency_name: data.emergencyName,
                emergency_phone: data.emergencyPhone,
                npwp: data.npwp,
                bpjs: data.bpjs,
                bank_account: data.bankAccount,
                manager_id: data.managerId,
                schedule_id: data.scheduleId,
                work_location_id: data.workLocationId,
              },
            });

            await tx.employmentHistory.create({
              data: {
                employee_id: employee.id,
                department: data.department,
                role: data.role,
                effective_date: data.joinDate,
                reason: "Import karyawan",
              },
            });
          });

          created += 1;
        }
      } catch (error) {
        skipped.push({
          line: row.line,
          errors: [error instanceof Error ? error.message : "Gagal menyimpan baris."],
        });
      }
    }

    await writeAudit({
      actorId: req.auth?.sub,
      action: "employee.import",
      entity: "Employee",
      newValues: { created, updated, skipped: skipped.length },
      ip: req.ip,
    });

    res.json({
      ok: true,
      created,
      updated,
      skippedCount: skipped.length,
      skipped,
    });
  },
);

// GET /api/v1/employees/:id/history
router.get("/:id/history", async (req: Request, res: Response) => {
  const scope = await employeeScope(req);
  const employee = await prisma.employee.findFirst({
    // AND dipakai agar scope tidak bisa tertimpa/tertimpa oleh id yang
    // diminta: karyawan hanya boleh membaca id miliknya sendiri.
    where: {
      AND: [scope, { id: String(req.params.id), deleted_at: null }],
    },
    select: { id: true },
  });

  if (!employee) {
    res.status(404).json({ error: "Karyawan tidak ditemukan." });
    return;
  }

  const history = await prisma.employmentHistory.findMany({
    where: { employee_id: employee.id },
    orderBy: { effective_date: "desc" },
  });

  res.json(history);
});

// GET /api/v1/employees/:id
router.get("/:id", async (req: Request, res: Response) => {
  const scope = await employeeScope(req);
  const employee = await prisma.employee.findFirst({
    where: {
      AND: [scope, { id: String(req.params.id), deleted_at: null }],
    },
  });

  if (!employee) {
    res.status(404).json({ error: "Karyawan tidak ditemukan." });
    return;
  }

  res.json(serializeEmployee(employee, canViewSensitive(req.auth?.role)));
});

// POST /api/v1/employees (khusus SUPER_ADMIN / HR_ADMIN)
router.post(
  "/",
  requireRole("SUPER_ADMIN", "HR_ADMIN"),
  async (req: Request, res: Response) => {
    const name = asString(req.body?.name);
    const email = asString(req.body?.email)?.toLowerCase();
    const nik = asString(req.body?.nik);

    if (!name || !email || !nik) {
      res.status(400).json({ error: "Nama, email, dan NIK wajib diisi." });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Format email tidak valid." });
      return;
    }

    const joinInput = asString(req.body?.joinDate);
    const joinDate = joinInput ? parseDateOnly(joinInput) : new Date();
    if (!joinDate) {
      res.status(400).json({
        error: "Tanggal masuk tidak valid (format YYYY-MM-DD).",
      });
      return;
    }

    const birthDate = parseOptionalDate(req.body?.birthDate);
    const exitDate = parseOptionalDate(req.body?.exitDate);

    if (birthDate === null && req.body?.birthDate !== undefined) {
      res.status(400).json({ error: "Format tanggal lahir tidak valid." });
      return;
    }

    if (exitDate === null && req.body?.exitDate !== undefined) {
      res.status(400).json({ error: "Format tanggal keluar tidak valid." });
      return;
    }

    if (exitDate instanceof Date && exitDate.getTime() < joinDate.getTime()) {
      res.status(400).json({
        error: "Tanggal keluar tidak boleh sebelum tanggal masuk.",
      });
      return;
    }

    const statusInput = asString(req.body?.status) ?? "Active";
    const status = ALLOWED_STATUS.has(statusInput) ? statusInput : "Active";
    const company = await getOrCreateCompany();

    const managerId = asString(req.body?.managerId);
    if (managerId) {
      const manager = await prisma.employee.findFirst({
        where: { id: managerId, deleted_at: null },
        select: { id: true },
      });
      if (!manager) {
        res.status(400).json({ error: "Atasan langsung tidak ditemukan." });
        return;
      }
    }

    const scheduleId = asString(req.body?.scheduleId);
    if (scheduleId) {
      const schedule = await prisma.workSchedule.findUnique({
        where: { id: scheduleId },
        select: { id: true },
      });
      if (!schedule) {
        res.status(400).json({ error: "Jadwal kerja tidak ditemukan." });
        return;
      }
    }

    const workLocationId = asString(req.body?.workLocationId);
    if (workLocationId) {
      const workLocation = await prisma.workLocation.findUnique({
        where: { id: workLocationId },
        select: { id: true },
      });
      if (!workLocation) {
        res.status(400).json({ error: "Lokasi kerja tidak ditemukan." });
        return;
      }
    }

    const employee = await prisma.employee.create({
      data: {
        company_id: company.id,
        name,
        email,
        nik,
        department: asString(req.body?.department) ?? "General",
        role: asString(req.body?.role) ?? "Staff",
        employment: asString(req.body?.employment) ?? "Full-time",
        location: asString(req.body?.location) ?? "Jakarta, ID",
        join_date: joinDate,
        status,
        phone: asString(req.body?.phone) ?? null,
        address: asString(req.body?.address) ?? null,
        birth_date: birthDate ?? null,
        exit_date: exitDate ?? null,
        emergency_name: asString(req.body?.emergencyName) ?? null,
        emergency_phone: asString(req.body?.emergencyPhone) ?? null,
        manager_id: managerId ?? null,
        schedule_id: scheduleId ?? null,
        work_location_id: workLocationId ?? null,
        npwp: asString(req.body?.npwp) ?? null,
        bpjs: asString(req.body?.bpjs) ?? null,
        bank_account: asString(req.body?.bankAccount) ?? null,
      },
    });

    await prisma.employmentHistory.create({
      data: {
        employee_id: employee.id,
        department: employee.department,
        role: employee.role,
        effective_date: employee.join_date,
        reason: "Data awal karyawan",
      },
    });

    await writeAudit({
      actorId: req.auth?.sub,
      action: "employee.create",
      entity: "Employee",
      entityId: employee.id,
      newValues: employee,
      ip: req.ip,
    });

    res.status(201).json(serializeEmployee(employee, true));
  },
);

// PATCH /api/v1/employees/:id
router.patch(
  "/:id",
  requireRole("SUPER_ADMIN", "HR_ADMIN"),
  async (req: Request, res: Response) => {
    const existing = await prisma.employee.findFirst({
      where: { id: String(req.params.id), deleted_at: null },
    });

    if (!existing) {
      res.status(404).json({ error: "Karyawan tidak ditemukan." });
      return;
    }

    const data: Prisma.EmployeeUpdateInput = {};

    const name = asString(req.body?.name);
    if (name) data.name = name;

    const email = asString(req.body?.email)?.toLowerCase();
    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: "Format email tidak valid." });
        return;
      }
      data.email = email;
    }

    const nik = asString(req.body?.nik);
    if (nik) data.nik = nik;

    const department = asString(req.body?.department);
    if (department) data.department = department;

    const role = asString(req.body?.role);
    if (role) data.role = role;

    const employment = asString(req.body?.employment);
    if (employment) data.employment = employment;

    const location = asString(req.body?.location);
    if (location) data.location = location;

    const status = asString(req.body?.status);
    if (status) {
      if (!ALLOWED_STATUS.has(status)) {
        res.status(400).json({ error: "Status karyawan tidak valid." });
        return;
      }
      data.status = status;
    }

    let nextJoinDate = existing.join_date;
    if (req.body?.joinDate !== undefined) {
      const parsed = parseOptionalDate(req.body.joinDate);
      if (!(parsed instanceof Date)) {
        res.status(400).json({
          error: "Tanggal masuk tidak valid (format YYYY-MM-DD).",
        });
        return;
      }
      data.join_date = parsed;
      nextJoinDate = parsed;
    }

    if (req.body?.birthDate !== undefined) {
      const parsed = parseOptionalDate(req.body.birthDate);
      if (parsed === null && asString(req.body.birthDate) !== undefined) {
        res.status(400).json({
          error: "Tanggal lahir tidak valid (format YYYY-MM-DD).",
        });
        return;
      }
      data.birth_date = parsed instanceof Date ? parsed : null;
    }

    let nextExitDate = existing.exit_date;
    if (req.body?.exitDate !== undefined) {
      const parsed = parseOptionalDate(req.body.exitDate);
      if (parsed === null && asString(req.body.exitDate) !== undefined) {
        res.status(400).json({
          error: "Tanggal keluar tidak valid (format YYYY-MM-DD).",
        });
        return;
      }
      data.exit_date = parsed instanceof Date ? parsed : null;
      nextExitDate = parsed instanceof Date ? parsed : null;
    }

    if (
      nextExitDate &&
      nextExitDate.getTime() < nextJoinDate.getTime()
    ) {
      res.status(400).json({
        error: "Tanggal keluar tidak boleh sebelum tanggal masuk.",
      });
      return;
    }

    for (const [bodyKey, field] of [
      ["phone", "phone"],
      ["address", "address"],
      ["emergencyName", "emergency_name"],
      ["emergencyPhone", "emergency_phone"],
      ["npwp", "npwp"],
      ["bpjs", "bpjs"],
      ["bankAccount", "bank_account"],
    ] as const) {
      if (req.body?.[bodyKey] !== undefined) {
        data[field] = asString(req.body[bodyKey]) ?? null;
      }
    }

    const managerId = asString(req.body?.managerId);
    if (req.body?.managerId !== undefined) {
      if (managerId) {
        if (managerId === existing.id) {
          res.status(400).json({ error: "Karyawan tidak bisa menjadi atasan dirinya sendiri." });
          return;
        }
        const manager = await prisma.employee.findFirst({
          where: { id: managerId, deleted_at: null },
          select: { id: true },
        });
        if (!manager) {
          res.status(400).json({ error: "Atasan langsung tidak ditemukan." });
          return;
        }
        if (await wouldCreateManagerCycle(existing.id, managerId)) {
          res.status(400).json({
            error:
              "Atasan yang dipilih menciptakan siklus hierarki. Pilih atasan lain.",
          });
          return;
        }
        data.manager = { connect: { id: managerId } };
      } else {
        data.manager = { disconnect: true };
      }
    }

    if (req.body?.scheduleId !== undefined) {
      const scheduleId = asString(req.body.scheduleId);
      if (scheduleId) {
        const schedule = await prisma.workSchedule.findUnique({
          where: { id: scheduleId },
          select: { id: true },
        });
        if (!schedule) {
          res.status(400).json({ error: "Jadwal kerja tidak ditemukan." });
          return;
        }
      }
      data.schedule = scheduleId
        ? { connect: { id: scheduleId } }
        : { disconnect: true };
    }

    if (req.body?.workLocationId !== undefined) {
      const workLocationId = asString(req.body.workLocationId);
      if (workLocationId) {
        const workLocation = await prisma.workLocation.findUnique({
          where: { id: workLocationId },
          select: { id: true },
        });
        if (!workLocation) {
          res.status(400).json({ error: "Lokasi kerja tidak ditemukan." });
          return;
        }
      }
      data.work_location = workLocationId
        ? { connect: { id: workLocationId } }
        : { disconnect: true };
    }

    const updated = await prisma.employee.update({
      where: { id: existing.id },
      data,
    });

    const nextDepartment = updated.department;
    const nextRole = updated.role;
    if (nextDepartment !== existing.department || nextRole !== existing.role) {
      await prisma.employmentHistory.create({
        data: {
          employee_id: updated.id,
          department: nextDepartment,
          role: nextRole,
          effective_date: parseDateOnly(asString(req.body?.effectiveDate)) ?? new Date(),
          reason: asString(req.body?.changeReason) ?? "Perubahan data karyawan",
        },
      });
    }

    await writeAudit({
      actorId: req.auth?.sub,
      action: "employee.update",
      entity: "Employee",
      entityId: updated.id,
      oldValues: existing,
      newValues: updated,
      ip: req.ip,
    });

    res.json(serializeEmployee(updated, true));
  },
);

// DELETE /api/v1/employees/:id (soft delete)
router.delete(
  "/:id",
  requireRole("SUPER_ADMIN", "HR_ADMIN"),
  async (req: Request, res: Response) => {
    const existing = await prisma.employee.findFirst({
      where: { id: String(req.params.id), deleted_at: null },
    });

    if (!existing) {
      res.status(404).json({ error: "Karyawan tidak ditemukan." });
      return;
    }

    const updated = await prisma.employee.update({
      where: { id: existing.id },
      data: {
        deleted_at: new Date(),
        status: "Inactive",
        exit_date: existing.exit_date ?? new Date(),
      },
    });

    await writeAudit({
      actorId: req.auth?.sub,
      action: "employee.delete",
      entity: "Employee",
      entityId: updated.id,
      oldValues: { status: existing.status, deleted_at: existing.deleted_at },
      newValues: { status: updated.status, deleted_at: updated.deleted_at },
      ip: req.ip,
    });

    res.json({ ok: true, id: updated.id });
  },
);

export default router;
