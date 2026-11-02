import type { Prisma } from "@prisma/client";
import type { Request } from "express";
import { prisma } from "./prisma";

export const JAKARTA_TZ = "Asia/Jakarta";
export const WORK_START = { hour: 9, minute: 0 };

const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: JAKARTA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Tanggal kalender WIB dalam format YYYY-MM-DD. */
export function jakartaDateKey(date: Date = new Date()): string {
  return dateKeyFormatter.format(date);
}

/** Tengah malam UTC untuk tanggal WIB hari ini (dipakai sebagai kunci unik). */
export function jakartaDayStart(date: Date = new Date()): Date {
  return new Date(`${jakartaDateKey(date)}T00:00:00.000Z`);
}

export function jakartaTimeParts(date: Date = new Date()): {
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: JAKARTA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const [hour, minute] = parts.split(":").map(Number);
  return { hour, minute };
}

export function isLate(date: Date, start = WORK_START): boolean {
  const { hour, minute } = jakartaTimeParts(date);
  return hour > start.hour || (hour === start.hour && minute > start.minute);
}

/** "09:00" -> 540 menit sejak tengah malam. */
export function parseTimeToMinutes(value?: string | null): number | null {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

/** Keterlambatan relatif terhadap jam masuk jadwal + toleransi. */
export function isLateAgainstSchedule(
  date: Date,
  startTime: string | null | undefined,
  toleranceMinutes = 0,
): boolean {
  const start = parseTimeToMinutes(startTime);
  const { hour, minute } = jakartaTimeParts(date);
  const minutes = hour * 60 + minute;

  if (start === null) {
    return isLate(date);
  }

  return minutes > start + Math.max(0, toleranceMinutes);
}

/** Ambil set hari libur (YYYY-MM-DD) pada rentang tanggal tertentu. */
export async function holidayDateKeys(start: Date, end: Date): Promise<Set<string>> {
  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: start, lte: end } },
    select: { date: true },
  });

  return new Set(holidays.map((holiday) => holiday.date.toISOString().slice(0, 10)));
}

/** Parse YYYY-MM-DD menjadi Date tengah malam UTC. */
export function parseDateOnly(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Tolak tanggal yang dinormalisasi otomatis oleh Date, mis. 2026-02-31.
  return parsed.toISOString().slice(0, 10) === value ? parsed : null;
}

/** Jumlah hari kerja (Senin–Jumat) inklusif. */
export function businessDays(start: Date, end: Date): number {
  let count = 0;
  for (
    let cursor = new Date(start);
    cursor.getTime() <= end.getTime();
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

export function monthRange(month?: string): { start: Date; end: Date } {
  const now = new Date();
  const match = month?.match(/^(\d{4})-(\d{2})$/);
  const parsedYear = match ? Number(match[1]) : Number.NaN;
  const parsedMonth = match ? Number(match[2]) : Number.NaN;
  const valid =
    Number.isInteger(parsedYear) &&
    parsedYear >= 1900 &&
    parsedYear <= 9999 &&
    Number.isInteger(parsedMonth) &&
    parsedMonth >= 1 &&
    parsedMonth <= 12;

  const prefix = valid
    ? `${String(parsedYear).padStart(4, "0")}-${String(parsedMonth).padStart(2, "0")}`
    : jakartaDateKey(now).slice(0, 7);
  const [year, monthNumber] = prefix.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 0, 23, 59, 59, 999));
  return { start, end };
}

export function isHrRole(role?: string | null): boolean {
  return role === "SUPER_ADMIN" || role === "HR_ADMIN";
}

export function canViewSensitive(role?: string | null): boolean {
  return isHrRole(role);
}

export function maskNik(value: string): string {
  if (value.length <= 6) return "•".repeat(value.length);
  return `${value.slice(0, 4)}${"•".repeat(value.length - 6)}${value.slice(-2)}`;
}

export function maskSecret(value: string | null): string | null {
  if (!value) return null;
  const clean = value.replace(/\s+/g, " ");
  if (clean.length <= 6) return "•".repeat(clean.length);
  return `${clean.slice(0, 3)}${"•".repeat(Math.min(8, clean.length - 6))}${clean.slice(-3)}`;
}

type EmployeeRecord = {
  id: string;
  company_id: string;
  user_id: string | null;
  manager_id: string | null;
  schedule_id: string | null;
  work_location_id: string | null;
  nik: string;
  name: string;
  email: string;
  phone: string | null;
  birth_date: Date | null;
  address: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  department: string;
  role: string;
  employment: string;
  location: string;
  join_date: Date;
  exit_date: Date | null;
  status: string;
  npwp: string | null;
  bpjs: string | null;
  bank_account: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export function serializeEmployee(employee: EmployeeRecord, sensitive: boolean) {
  return {
    ...employee,
    nik: sensitive ? employee.nik : maskNik(employee.nik),
    npwp: sensitive ? employee.npwp : maskSecret(employee.npwp),
    bpjs: sensitive ? employee.bpjs : maskSecret(employee.bpjs),
    bank_account: sensitive ? employee.bank_account : maskSecret(employee.bank_account),
  };
}

export async function getEmployeeForUser(userId?: string | null) {
  if (!userId) return null;
  return prisma.employee.findUnique({ where: { user_id: userId } });
}

/** Batas data yang boleh dilihat sesuai peran (row-level scoping). */
export async function employeeScope(
  req: Request,
): Promise<Prisma.EmployeeWhereInput> {
  const auth = req.auth;
  if (!auth) return { id: "__none__" };
  if (isHrRole(auth.role)) return {};

  const employee = await getEmployeeForUser(auth.sub);
  if (!employee || employee.deleted_at) return { id: "__none__" };

  if (auth.role === "MANAGER") {
    return { OR: [{ id: employee.id }, { manager_id: employee.id }] };
  }

  return { id: employee.id };
}

/** Apakah user boleh menyetujui cuti karyawan tertentu. */
export async function canReviewEmployee(
  req: Request,
  employeeId: string,
): Promise<boolean> {
  const auth = req.auth;
  if (!auth) return false;
  if (isHrRole(auth.role)) return true;
  if (auth.role !== "MANAGER") return false;

  const manager = await getEmployeeForUser(auth.sub);
  if (!manager || manager.id === employeeId) return false;

  const target = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { manager_id: true },
  });

  return target?.manager_id === manager.id;
}
