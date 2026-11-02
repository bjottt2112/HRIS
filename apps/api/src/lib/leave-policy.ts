import { parseDateOnly } from "./hr";

export const DEFAULT_WORK_DAYS = "1,2,3,4,5";

/** Parse "1,2,3,4,5" (1=Senin .. 7=Minggu) menjadi Set hari ISO. */
export function parseWorkDays(value?: string | null): Set<number> {
  const days = new Set<number>();
  const source = value && value.trim() ? value : DEFAULT_WORK_DAYS;

  for (const part of source.split(",")) {
    const day = Number(part.trim());
    if (Number.isInteger(day) && day >= 1 && day <= 7) days.add(day);
  }

  if (days.size === 0) {
    for (const day of DEFAULT_WORK_DAYS.split(",")) days.add(Number(day));
  }

  return days;
}

/** Ubah Date (UTC) menjadi nomor hari ISO 1..7 (Senin=1, Minggu=7). */
export function isoDayOfWeek(date: Date): number {
  const jsDay = date.getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * Hitung hari kerja inklusif berdasarkan hari kerja dan hari libur
 * (format YYYY-MM-DD). Dipakai untuk cuti dan rekap absensi.
 */
export function countWorkingDays(
  start: Date,
  end: Date,
  workDays: Set<number>,
  holidays: Set<string> = new Set(),
): number {
  let count = 0;

  for (
    let cursor = new Date(start);
    cursor.getTime() <= end.getTime();
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    if (!workDays.has(isoDayOfWeek(cursor))) continue;
    if (holidays.has(cursor.toISOString().slice(0, 10))) continue;
    count += 1;
  }

  return count;
}

/**
 * Kuota pro-rata untuk karyawan yang bergabung di tengah tahun.
 * Bulan bergabung dihitung penuh; hasil dibulatkan ke atas.
 */
export function proratedQuota(
  fullQuota: number,
  joinDate: Date | null | undefined,
  year: number,
): number {
  if (fullQuota <= 0) return 0;
  if (!joinDate) return fullQuota;

  const joinYear = joinDate.getUTCFullYear();
  if (joinYear < year) return fullQuota;
  if (joinYear > year) return 0;

  const monthsRemaining = 12 - joinDate.getUTCMonth();
  return Math.max(0, Math.ceil((fullQuota * monthsRemaining) / 12));
}

/** Sisa saldo yang boleh dibawa ke tahun berikutnya, dibatasi kebijakan. */
export function carryOverDays(
  entitled: number,
  used: number,
  maxCarryOver: number,
): number {
  if (maxCarryOver <= 0) return 0;
  const remaining = Math.max(0, entitled - used);
  return Math.min(remaining, maxCarryOver);
}

/**
 * Tanggal kedaluwarsa saldo carry-over: 31 Maret tahun berikutnya.
 * Mengembalikan tengah malam UTC untuk konsistensi dengan kolom tanggal lain.
 */
export function carryOverExpiry(year: number): Date {
  return new Date(`${year + 1}-03-31T00:00:00.000Z`);
}

/** Normalisasi input tanggal cuti (YYYY-MM-DD) menjadi Date UTC. */
export function parseLeaveRange(
  startInput?: string,
  endInput?: string,
): { start: Date; end: Date } | null {
  const start = parseDateOnly(startInput);
  const end = parseDateOnly(endInput);
  if (!start || !end) return null;
  if (end.getTime() < start.getTime()) return null;
  return { start, end };
}
