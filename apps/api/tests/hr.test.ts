import type { Request } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  holiday: { findMany: vi.fn() },
}));

vi.mock("../src/lib/prisma", () => ({ prisma: prismaMock }));

const {
  businessDays,
  canReviewEmployee,
  canViewSensitive,
  employeeScope,
  getEmployeeForUser,
  holidayDateKeys,
  isHrRole,
  isLate,
  isLateAgainstSchedule,
  jakartaDateKey,
  jakartaDayStart,
  jakartaTimeParts,
  maskNik,
  maskSecret,
  monthRange,
  parseDateOnly,
  parseTimeToMinutes,
  serializeEmployee,
} = await import("../src/lib/hr");

function fakeRequest(auth?: {
  sub: string;
  role: string;
}): Request {
  return { auth } as unknown as Request;
}

function employee(overrides: Record<string, unknown> = {}) {
  return {
    id: "emp-1",
    company_id: "company-1",
    user_id: "user-1",
    manager_id: null,
    schedule_id: null,
    work_location_id: null,
    nik: "3171091203940001",
    name: "Alexander Wright",
    email: "alexander.wright@montreux.co",
    phone: null,
    birth_date: null,
    address: null,
    emergency_name: null,
    emergency_phone: null,
    department: "Product",
    role: "Lead Product Designer",
    employment: "Full-time",
    location: "Jakarta, ID",
    join_date: new Date("2022-03-14T00:00:00.000Z"),
    exit_date: null,
    status: "Active",
    npwp: "09.254.294.1-403.000",
    bpjs: "0001234567890",
    bank_account: "BCA 1234567890",
    deleted_at: null,
    created_at: new Date("2022-03-14T00:00:00.000Z"),
    updated_at: new Date("2022-03-14T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  prismaMock.employee.findUnique.mockReset();
  prismaMock.holiday.findMany.mockReset();
});

describe("tanggal & waktu Jakarta", () => {
  it("menghasilkan kunci tanggal WIB walau UTC masih hari sebelumnya", () => {
    // 2026-11-01T18:30Z = 2026-11-02 01:30 WIB.
    expect(jakartaDateKey(new Date("2026-11-01T18:30:00.000Z"))).toBe("2026-11-02");
    expect(jakartaDayStart(new Date("2026-11-01T18:30:00.000Z")).toISOString()).toBe(
      "2026-11-02T00:00:00.000Z",
    );
  });

  it("mengambil jam dan menit WIB", () => {
    expect(jakartaTimeParts(new Date("2026-11-02T02:15:00.000Z"))).toEqual({
      hour: 9,
      minute: 15,
    });
  });
});

describe("keterlambatan", () => {
  it("menilai terlambat terhadap jam 09:00 default", () => {
    expect(isLate(new Date("2026-11-02T01:59:00.000Z"))).toBe(false); // 08:59 WIB
    expect(isLate(new Date("2026-11-02T02:00:00.000Z"))).toBe(false); // 09:00 WIB
    expect(isLate(new Date("2026-11-02T02:01:00.000Z"))).toBe(true); // 09:01 WIB
  });

  it("mengurai jam HH:MM menjadi menit", () => {
    expect(parseTimeToMinutes("09:00")).toBe(540);
    expect(parseTimeToMinutes("17:30")).toBe(1050);
    expect(parseTimeToMinutes("24:00")).toBeNull();
    expect(parseTimeToMinutes("9:00")).toBeNull();
    expect(parseTimeToMinutes(null)).toBeNull();
    expect(parseTimeToMinutes(undefined)).toBeNull();
  });

  it("menghormati toleransi jadwal", () => {
    const at0905 = new Date("2026-11-02T02:05:00.000Z");
    expect(isLateAgainstSchedule(at0905, "09:00", 0)).toBe(true);
    expect(isLateAgainstSchedule(at0905, "09:00", 15)).toBe(false);
    expect(isLateAgainstSchedule(at0905, "08:00", 0)).toBe(true);
    expect(isLateAgainstSchedule(at0905, null, 0)).toBe(true);
    expect(isLateAgainstSchedule(at0905, "invalid", 0)).toBe(true);
    // Toleransi negatif dinormalisasi menjadi 0.
    expect(isLateAgainstSchedule(at0905, "09:00", -30)).toBe(true);
  });
});

describe("parseDateOnly", () => {
  it("menerima format YYYY-MM-DD saja", () => {
    expect(parseDateOnly("2026-11-02")?.toISOString()).toBe(
      "2026-11-02T00:00:00.000Z",
    );
    expect(parseDateOnly("2026-11-02T10:00:00Z")).toBeNull();
    expect(parseDateOnly("02-11-2026")).toBeNull();
    expect(parseDateOnly("2026-13-01")).toBeNull();
    expect(parseDateOnly(undefined)).toBeNull();
  });

  it("menolak tanggal kalender yang tidak ada", () => {
    expect(parseDateOnly("2026-02-29")).toBeNull(); // 2026 bukan tahun kabisat.
    expect(parseDateOnly("2026-02-31")).toBeNull();
    expect(parseDateOnly("2026-04-31")).toBeNull();
    expect(parseDateOnly("2028-02-29")?.toISOString()).toBe(
      "2028-02-29T00:00:00.000Z",
    );
  });
});

describe("businessDays & monthRange", () => {
  it("menghitung hari kerja Senin-Jumat", () => {
    expect(
      businessDays(
        new Date("2026-11-02T00:00:00.000Z"),
        new Date("2026-11-08T00:00:00.000Z"),
      ),
    ).toBe(5);
  });

  it("menghasilkan rentang bulan penuh", () => {
    const november = monthRange("2026-11");
    expect(november.start.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(november.end.toISOString()).toBe("2026-11-30T23:59:59.999Z");

    const february = monthRange("2026-02");
    expect(february.end.toISOString()).toBe("2026-02-28T23:59:59.999Z");

    // Input tidak valid jatuh ke bulan berjalan.
    const fallback = monthRange("bukan-bulan");
    expect(fallback.start.getUTCDate()).toBe(1);

    // Bulan di luar 01..12 juga tidak boleh dinormalisasi menjadi tahun lain.
    const currentMonth = jakartaDateKey().slice(0, 7);
    const bogusMonth = monthRange("2026-13");
    expect(bogusMonth.start.toISOString().slice(0, 7)).toBe(currentMonth);
  });
});

describe("masking & peran", () => {
  it("mengenali peran HR", () => {
    expect(isHrRole("SUPER_ADMIN")).toBe(true);
    expect(isHrRole("HR_ADMIN")).toBe(true);
    expect(isHrRole("MANAGER")).toBe(false);
    expect(isHrRole(null)).toBe(false);
    expect(canViewSensitive("HR_ADMIN")).toBe(true);
    expect(canViewSensitive("EMPLOYEE")).toBe(false);
  });

  it("menyamarkan NIK dengan menyisakan 4 digit awal dan 2 digit akhir", () => {
    expect(maskNik("3171091203940001")).toBe(`3171${"•".repeat(10)}01`);
    expect(maskNik("123456")).toBe("•".repeat(6));
    expect(maskNik("123")).toBe("•".repeat(3));
  });

  it("menyamarkan data sensitif lain", () => {
    expect(maskSecret(null)).toBeNull();
    expect(maskSecret("123456")).toBe("•".repeat(6));
    expect(maskSecret("BCA 1234567890")).toBe(`BCA${"•".repeat(8)}890`);
  });

  it("hanya membuka data sensitif untuk peran yang berhak", () => {
    const record = employee();
    const masked = serializeEmployee(record, false);
    expect(masked.nik).toBe("3171••••••••••01");
    expect(masked.npwp).not.toBe(record.npwp);
    expect(masked.bpjs).not.toBe(record.bpjs);
    expect(masked.bank_account).not.toBe(record.bank_account);
    expect(masked.email).toBe(record.email);

    const full = serializeEmployee(record, true);
    expect(full.nik).toBe(record.nik);
    expect(full.npwp).toBe(record.npwp);
  });
});

describe("holidayDateKeys", () => {
  it("mengubah baris hari libur menjadi set tanggal", async () => {
    prismaMock.holiday.findMany.mockResolvedValue([
      { date: new Date("2026-11-03T00:00:00.000Z") },
      { date: new Date("2026-12-25T00:00:00.000Z") },
    ]);

    const keys = await holidayDateKeys(
      new Date("2026-11-01T00:00:00.000Z"),
      new Date("2026-12-31T00:00:00.000Z"),
    );

    expect([...keys]).toEqual(["2026-11-03", "2026-12-25"]);
  });
});

describe("row-level scoping", () => {
  it("HR melihat semua karyawan", async () => {
    expect(await employeeScope(fakeRequest({ sub: "u", role: "HR_ADMIN" }))).toEqual(
      {},
    );
    expect(
      await employeeScope(fakeRequest({ sub: "u", role: "SUPER_ADMIN" })),
    ).toEqual({});
  });

  it("tanpa autentikasi tidak melihat apa pun", async () => {
    expect(await employeeScope(fakeRequest())).toEqual({ id: "__none__" });
  });

  it("EMPLOYEE hanya melihat dirinya", async () => {
    prismaMock.employee.findUnique.mockResolvedValue(employee());
    expect(
      await employeeScope(fakeRequest({ sub: "user-1", role: "EMPLOYEE" })),
    ).toEqual({ id: "emp-1" });
  });

  it("MANAGER melihat diri sendiri dan bawahan langsung", async () => {
    prismaMock.employee.findUnique.mockResolvedValue(employee());
    expect(
      await employeeScope(fakeRequest({ sub: "user-1", role: "MANAGER" })),
    ).toEqual({ OR: [{ id: "emp-1" }, { manager_id: "emp-1" }] });
  });

  it("akun tanpa data karyawan atau sudah dihapus tidak melihat apa pun", async () => {
    prismaMock.employee.findUnique.mockResolvedValue(null);
    expect(
      await employeeScope(fakeRequest({ sub: "user-x", role: "EMPLOYEE" })),
    ).toEqual({ id: "__none__" });

    prismaMock.employee.findUnique.mockResolvedValue(
      employee({ deleted_at: new Date() }),
    );
    expect(
      await employeeScope(fakeRequest({ sub: "user-1", role: "MANAGER" })),
    ).toEqual({ id: "__none__" });
  });
});

describe("canReviewEmployee", () => {
  it("HR selalu boleh", async () => {
    expect(
      await canReviewEmployee(fakeRequest({ sub: "u", role: "HR_ADMIN" }), "emp-9"),
    ).toBe(true);
  });

  it("tanpa autentikasi atau non-manager tidak boleh", async () => {
    expect(await canReviewEmployee(fakeRequest(), "emp-9")).toBe(false);
    expect(
      await canReviewEmployee(fakeRequest({ sub: "u", role: "EMPLOYEE" }), "emp-9"),
    ).toBe(false);
  });

  it("manager hanya boleh untuk bawahan langsung, bukan dirinya", async () => {
    prismaMock.employee.findUnique.mockImplementation(
      async ({ where }: { where: Record<string, unknown> }) => {
        if ("user_id" in where) return employee({ id: "emp-manager" });
        return { manager_id: "emp-manager" };
      },
    );

    expect(
      await canReviewEmployee(
        fakeRequest({ sub: "user-1", role: "MANAGER" }),
        "emp-staff",
      ),
    ).toBe(true);
    expect(
      await canReviewEmployee(
        fakeRequest({ sub: "user-1", role: "MANAGER" }),
        "emp-manager",
      ),
    ).toBe(false);
  });

  it("menolak bila karyawan bukan bawahan manager tersebut", async () => {
    prismaMock.employee.findUnique.mockImplementation(
      async ({ where }: { where: Record<string, unknown> }) => {
        if ("user_id" in where) return employee({ id: "emp-manager" });
        return { manager_id: "emp-lain" };
      },
    );

    expect(
      await canReviewEmployee(
        fakeRequest({ sub: "user-1", role: "MANAGER" }),
        "emp-staff",
      ),
    ).toBe(false);
  });
});

describe("getEmployeeForUser", () => {
  it("mengembalikan null tanpa userId", async () => {
    expect(await getEmployeeForUser(null)).toBeNull();
    expect(prismaMock.employee.findUnique).not.toHaveBeenCalled();
  });

  it("mencari karyawan berdasarkan user_id", async () => {
    prismaMock.employee.findUnique.mockResolvedValue(employee());
    const result = await getEmployeeForUser("user-1");
    expect(result?.id).toBe("emp-1");
    expect(prismaMock.employee.findUnique).toHaveBeenCalledWith({
      where: { user_id: "user-1" },
    });
  });
});
