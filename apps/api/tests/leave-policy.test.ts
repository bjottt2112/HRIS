import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/prisma", () => ({
  prisma: {
    holiday: { findMany: vi.fn() },
    employee: { findUnique: vi.fn() },
  },
}));

const {
  carryOverDays,
  carryOverExpiry,
  countWorkingDays,
  isoDayOfWeek,
  parseLeaveRange,
  parseWorkDays,
  proratedQuota,
} = await import("../src/lib/leave-policy");

const WORK_DAYS = parseWorkDays("1,2,3,4,5");

describe("parseWorkDays", () => {
  it("mengurai daftar hari dan mengabaikan nilai tidak valid", () => {
    expect([...parseWorkDays("1,3,5")]).toEqual([1, 3, 5]);
    expect([...parseWorkDays("0,1,8,x,2")]).toEqual([1, 2]);
  });

  it("memakai default Senin-Jumat bila kosong", () => {
    expect([...parseWorkDays(undefined)]).toEqual([1, 2, 3, 4, 5]);
    expect([...parseWorkDays("   ")]).toEqual([1, 2, 3, 4, 5]);
    expect([...parseWorkDays("99")]).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("isoDayOfWeek", () => {
  it("memetakan Minggu menjadi 7 dan Senin menjadi 1", () => {
    expect(isoDayOfWeek(new Date("2026-11-01T00:00:00.000Z"))).toBe(7); // Minggu
    expect(isoDayOfWeek(new Date("2026-11-02T00:00:00.000Z"))).toBe(1); // Senin
    expect(isoDayOfWeek(new Date("2026-11-06T00:00:00.000Z"))).toBe(5); // Jumat
  });
});

describe("countWorkingDays", () => {
  it("menghitung hari kerja inklusif dan melewati akhir pekan", () => {
    // Senin 2 Nov 2026 s/d Jumat 6 Nov 2026 = 5 hari kerja.
    expect(
      countWorkingDays(
        new Date("2026-11-02T00:00:00.000Z"),
        new Date("2026-11-06T00:00:00.000Z"),
        WORK_DAYS,
      ),
    ).toBe(5);

    // Ditambah Sabtu-Minggu, tetap 5.
    expect(
      countWorkingDays(
        new Date("2026-11-02T00:00:00.000Z"),
        new Date("2026-11-08T00:00:00.000Z"),
        WORK_DAYS,
      ),
    ).toBe(5);
  });

  it("melewati hari libur nasional", () => {
    const holidays = new Set(["2026-11-03"]);
    expect(
      countWorkingDays(
        new Date("2026-11-02T00:00:00.000Z"),
        new Date("2026-11-06T00:00:00.000Z"),
        WORK_DAYS,
        holidays,
      ),
    ).toBe(4);
  });

  it("mendukung jadwal kerja enam hari", () => {
    expect(
      countWorkingDays(
        new Date("2026-11-02T00:00:00.000Z"),
        new Date("2026-11-07T00:00:00.000Z"),
        parseWorkDays("1,2,3,4,5,6"),
      ),
    ).toBe(6);
  });

  it("mengembalikan 0 bila rentang terbalik", () => {
    expect(
      countWorkingDays(
        new Date("2026-11-06T00:00:00.000Z"),
        new Date("2026-11-02T00:00:00.000Z"),
        WORK_DAYS,
      ),
    ).toBe(0);
  });
});

describe("proratedQuota", () => {
  it("memberi kuota penuh untuk karyawan lama", () => {
    expect(proratedQuota(12, new Date("2020-01-01T00:00:00.000Z"), 2026)).toBe(12);
  });

  it("memberi kuota penuh bila tanggal masuk tidak diketahui", () => {
    expect(proratedQuota(12, null, 2026)).toBe(12);
    expect(proratedQuota(12, undefined, 2026)).toBe(12);
  });

  it("menghitung pro-rata bulan bergabung (dibulatkan ke atas)", () => {
    // Bergabung Juli 2026 -> 6 bulan tersisa -> 12 * 6/12 = 6.
    expect(proratedQuota(12, new Date("2026-07-15T00:00:00.000Z"), 2026)).toBe(6);
    // Bergabung Desember -> 1 bulan -> 12/12 = 1.
    expect(proratedQuota(12, new Date("2026-12-01T00:00:00.000Z"), 2026)).toBe(1);
    // Kuota 10, bergabung September (4 bulan) -> ceil(10*4/12)=4.
    expect(proratedQuota(10, new Date("2026-09-01T00:00:00.000Z"), 2026)).toBe(4);
  });

  it("mengembalikan 0 untuk tahun sebelum bergabung atau kuota 0", () => {
    expect(proratedQuota(12, new Date("2027-01-01T00:00:00.000Z"), 2026)).toBe(0);
    expect(proratedQuota(0, new Date("2026-01-01T00:00:00.000Z"), 2026)).toBe(0);
    expect(proratedQuota(-5, null, 2026)).toBe(0);
  });
});

describe("carryOverDays", () => {
  it("membatasi sisa saldo sesuai kebijakan", () => {
    expect(carryOverDays(12, 4, 6)).toBe(6);
    expect(carryOverDays(12, 10, 6)).toBe(2);
  });

  it("tidak membawa saldo negatif atau bila kebijakan 0", () => {
    expect(carryOverDays(12, 20, 6)).toBe(0);
    expect(carryOverDays(12, 0, 0)).toBe(0);
    expect(carryOverDays(12, 0, -1)).toBe(0);
  });
});

describe("carryOverExpiry", () => {
  it("kedaluwarsa 31 Maret tahun berikutnya", () => {
    expect(carryOverExpiry(2025).toISOString()).toBe("2026-03-31T00:00:00.000Z");
  });
});

describe("parseLeaveRange", () => {
  it("mengurai rentang tanggal yang valid", () => {
    const range = parseLeaveRange("2026-11-02", "2026-11-03");
    expect(range?.start.toISOString()).toBe("2026-11-02T00:00:00.000Z");
    expect(range?.end.toISOString()).toBe("2026-11-03T00:00:00.000Z");
  });

  it("menolak tanggal tidak valid atau rentang terbalik", () => {
    expect(parseLeaveRange(undefined, "2026-11-03")).toBeNull();
    expect(parseLeaveRange("2026-11-02", undefined)).toBeNull();
    expect(parseLeaveRange("2026-13-02", "2026-11-03")).toBeNull();
    expect(parseLeaveRange("2026-11-05", "2026-11-03")).toBeNull();
  });
});
