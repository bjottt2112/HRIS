import { hashPassword } from "../src/lib/auth";
import { prisma, pool } from "../src/lib/prisma";
import { proratedQuota } from "../src/lib/leave-policy";

type SeedEmployee = {
  name: string;
  email: string;
  nik: string;
  department: string;
  role: string;
  employment: string;
  location: string;
  join_date: string;
  status: string;
  npwp: string;
  bpjs: string;
  bank_account: string;
};

const employees: SeedEmployee[] = [
  {
    name: "Alexander Wright",
    email: "alexander.wright@montreux.co",
    nik: "3171091203940001",
    department: "Product",
    role: "Lead Product Designer",
    employment: "Full-time",
    location: "Jakarta, ID",
    join_date: "2022-03-14",
    status: "Active",
    npwp: "09.254.294.1-403.000",
    bpjs: "0001234567890",
    bank_account: "BCA 1234567890",
  },
  {
    name: "Siti Rahmawati",
    email: "siti.rahmawati@montreux.co",
    nik: "3171094508910002",
    department: "Engineering",
    role: "Backend Engineer",
    employment: "Full-time",
    location: "Bandung, ID",
    join_date: "2021-08-02",
    status: "Active",
    npwp: "09.254.294.2-403.000",
    bpjs: "0001234567891",
    bank_account: "Mandiri 9876543210",
  },
  {
    name: "Budi Santoso",
    email: "budi.santoso@montreux.co",
    nik: "3171091107890003",
    department: "Engineering",
    role: "Frontend Engineer",
    employment: "Contract",
    location: "Yogyakarta, ID",
    join_date: "2023-01-09",
    status: "Active",
    npwp: "09.254.294.3-403.000",
    bpjs: "0001234567892",
    bank_account: "BNI 1122334455",
  },
  {
    name: "Maya Kusuma",
    email: "maya.kusuma@montreux.co",
    nik: "3171092205920004",
    department: "Marketing",
    role: "Marketing Manager",
    employment: "Full-time",
    location: "Jakarta, ID",
    join_date: "2020-11-23",
    status: "On Leave",
    npwp: "09.254.294.4-403.000",
    bpjs: "0001234567893",
    bank_account: "BCA 5566778899",
  },
  {
    name: "Rizky Pratama",
    email: "rizky.pratama@montreux.co",
    nik: "3171091802950005",
    department: "Finance",
    role: "Finance Analyst",
    employment: "Full-time",
    location: "Jakarta, ID",
    join_date: "2022-06-06",
    status: "Active",
    npwp: "09.254.294.5-403.000",
    bpjs: "0001234567894",
    bank_account: "BRI 3344556677",
  },
  {
    name: "Dewi Lestari",
    email: "dewi.lestari@montreux.co",
    nik: "3171093009930006",
    department: "People",
    role: "HR Business Partner",
    employment: "Full-time",
    location: "Surabaya, ID",
    join_date: "2019-04-15",
    status: "Active",
    npwp: "09.254.294.6-403.000",
    bpjs: "0001234567895",
    bank_account: "BCA 7788990011",
  },
  {
    name: "Fajar Nugroho",
    email: "fajar.nugroho@montreux.co",
    nik: "3171090711940007",
    department: "Product",
    role: "Product Manager",
    employment: "Full-time",
    location: "Jakarta, ID",
    join_date: "2021-02-01",
    status: "Active",
    npwp: "09.254.294.7-403.000",
    bpjs: "0001234567896",
    bank_account: "Mandiri 2233445566",
  },
  {
    name: "Putri Anggraini",
    email: "putri.anggraini@montreux.co",
    nik: "3171091412960008",
    department: "Marketing",
    role: "Content Strategist",
    employment: "Internship",
    location: "Remote, ID",
    join_date: "2024-07-01",
    status: "Inactive",
    npwp: "09.254.294.8-403.000",
    bpjs: "0001234567897",
    bank_account: "BCA 6677889900",
  },
];

async function main() {
  let company = await prisma.company.findFirst({ orderBy: { id: "asc" } });

  if (!company) {
    company = await prisma.company.create({
      data: { name: "Montreux Corp", timezone: "Asia/Jakarta" },
    });
    console.log(`🏢 Company dibuat: ${company.name}`);
  }

  for (const employee of employees) {
    const { join_date, ...rest } = employee;
    const data = {
      ...rest,
      company_id: company.id,
      join_date: new Date(join_date),
    };

    await prisma.employee.upsert({
      where: { email: employee.email },
      update: data,
      create: data,
    });
  }

  const users = [
    {
      email: "admin@montreux.co",
      name: "Super Admin",
      password: "Admin123!",
      role: "SUPER_ADMIN",
      employeeEmail: null,
    },
    {
      email: "hr@montreux.co",
      name: "HR Admin",
      password: "Hr123456!",
      role: "HR_ADMIN",
      employeeEmail: null,
    },
    {
      email: "alexander.wright@montreux.co",
      name: "Alexander Wright",
      password: "Employee123!",
      role: "EMPLOYEE",
      employeeEmail: "alexander.wright@montreux.co",
    },
    {
      email: "siti.rahmawati@montreux.co",
      name: "Siti Rahmawati",
      password: "Employee123!",
      role: "EMPLOYEE",
      employeeEmail: "siti.rahmawati@montreux.co",
    },
    {
      email: "fajar.nugroho@montreux.co",
      name: "Fajar Nugroho",
      password: "Manager123!",
      role: "MANAGER",
      employeeEmail: "fajar.nugroho@montreux.co",
    },
  ];

  for (const account of users) {
    const passwordHash = await hashPassword(account.password);

    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: {
        name: account.name,
        password_hash: passwordHash,
        role: account.role,
        status: "ACTIVE",
      },
      create: {
        email: account.email,
        name: account.name,
        password_hash: passwordHash,
        role: account.role,
        status: "ACTIVE",
      },
    });

    if (account.employeeEmail) {
      const employee = await prisma.employee.findUnique({
        where: { email: account.employeeEmail },
      });

      if (employee) {
        await prisma.employee.update({
          where: { id: employee.id },
          data: { user_id: user.id },
        });
      }
    }
  }

  // Relasi atasan–bawahan untuk demo approval cuti.
  const manager = await prisma.employee.findUnique({
    where: { email: "fajar.nugroho@montreux.co" },
  });

  if (manager) {
    await prisma.employee.updateMany({
      where: {
        email: {
          in: [
            "alexander.wright@montreux.co",
            "siti.rahmawati@montreux.co",
          ],
        },
      },
      data: { manager_id: manager.id },
    });
  }

  // Jadwal kerja, lokasi (geofence), dan hari libur demo.
  const schedules = [
    {
      name: "Kantor Pusat",
      start_time: "09:00",
      end_time: "17:00",
      late_tolerance_minutes: 15,
      work_days: "1,2,3,4,5",
    },
    {
      name: "Shift Pagi",
      start_time: "08:00",
      end_time: "16:00",
      late_tolerance_minutes: 10,
      work_days: "1,2,3,4,5",
    },
    {
      name: "Remote Fleksibel",
      start_time: "09:00",
      end_time: "17:00",
      late_tolerance_minutes: 30,
      work_days: "1,2,3,4,5",
    },
  ];

  for (const schedule of schedules) {
    await prisma.workSchedule.upsert({
      where: { name: schedule.name },
      update: schedule,
      create: schedule,
    });
  }

  const locations = [
    {
      name: "Jakarta HQ",
      latitude: -6.2088,
      longitude: 106.8456,
      radius_meters: 250,
      allow_wfh: true,
    },
    {
      name: "Bandung Office",
      latitude: -6.9175,
      longitude: 107.6191,
      radius_meters: 200,
      allow_wfh: true,
    },
  ];

  for (const location of locations) {
    await prisma.workLocation.upsert({
      where: { name: location.name },
      update: location,
      create: location,
    });
  }

  const holidays = [
    ["2026-01-01", "Tahun Baru Masehi"],
    ["2026-02-17", "Tahun Baru Imlek"],
    ["2026-03-19", "Hari Suci Nyepi"],
    ["2026-03-20", "Hari Raya Idul Fitri"],
    ["2026-03-21", "Hari Raya Idul Fitri"],
    ["2026-04-03", "Wafat Isa Al Masih"],
    ["2026-05-01", "Hari Buruh Internasional"],
    ["2026-05-14", "Kenaikan Isa Al Masih"],
    ["2026-05-27", "Hari Raya Idul Adha"],
    ["2026-06-01", "Hari Lahir Pancasila"],
    ["2026-06-16", "Tahun Baru Islam"],
    ["2026-08-17", "Hari Kemerdekaan RI"],
    ["2026-08-25", "Maulid Nabi Muhammad"],
    ["2026-12-25", "Hari Raya Natal"],
  ] as const;

  for (const [date, name] of holidays) {
    await prisma.holiday.upsert({
      where: { date: new Date(`${date}T00:00:00.000Z`) },
      update: { name, type: "NATIONAL" },
      create: { date: new Date(`${date}T00:00:00.000Z`), name, type: "NATIONAL" },
    });
  }

  const defaultSchedule = await prisma.workSchedule.findUnique({
    where: { name: "Kantor Pusat" },
  });
  const bandung = await prisma.workLocation.findUnique({
    where: { name: "Bandung Office" },
  });
  const jakarta = await prisma.workLocation.findUnique({
    where: { name: "Jakarta HQ" },
  });

  if (defaultSchedule && bandung && jakarta) {
    await prisma.employee.updateMany({
      where: {
        email: { in: ["budi.santoso@montreux.co", "siti.rahmawati@montreux.co"] },
      },
      data: { schedule_id: defaultSchedule.id, work_location_id: bandung.id },
    });
    await prisma.employee.updateMany({
      where: {
        email: {
          notIn: ["budi.santoso@montreux.co", "siti.rahmawati@montreux.co"],
        },
      },
      data: { schedule_id: defaultSchedule.id, work_location_id: jakarta.id },
    });
  }

  // Jenis cuti + kebijakan approval dan saldo awal untuk tahun berjalan.
  const leaveTypes = [
    {
      code: "ANNUAL",
      name: "Cuti Tahunan",
      default_quota: 12,
      carry_over_max: 6,
      requires_hr_approval: false,
      requires_attachment: false,
      min_service_months: 0,
    },
    {
      code: "SICK",
      name: "Cuti Sakit",
      default_quota: 12,
      carry_over_max: 0,
      requires_hr_approval: false,
      requires_attachment: true,
      min_service_months: 0,
    },
    {
      code: "MATERNITY",
      name: "Cuti Melahirkan",
      default_quota: 90,
      carry_over_max: 0,
      requires_hr_approval: true,
      requires_attachment: true,
      min_service_months: 12,
    },
    {
      code: "MARRIAGE",
      name: "Cuti Menikah",
      default_quota: 3,
      carry_over_max: 0,
      requires_hr_approval: true,
      requires_attachment: true,
      min_service_months: 0,
    },
    {
      code: "BEREAVEMENT",
      name: "Cuti Duka",
      default_quota: 3,
      carry_over_max: 0,
      requires_hr_approval: false,
      requires_attachment: false,
      min_service_months: 0,
    },
    {
      code: "UNPAID",
      name: "Cuti Tanpa Gaji",
      default_quota: 0,
      carry_over_max: 0,
      requires_hr_approval: true,
      requires_attachment: false,
      min_service_months: 0,
    },
  ];

  for (const type of leaveTypes) {
    await prisma.leaveType.upsert({
      where: { code: type.code },
      update: type,
      create: type,
    });
  }

  const year = new Date().getUTCFullYear();
  const activeEmployees = await prisma.employee.findMany({
    where: { deleted_at: null },
    select: { id: true, join_date: true, department: true, role: true },
  });
  const allLeaveTypes = await prisma.leaveType.findMany();

  for (const employee of activeEmployees) {
    for (const type of allLeaveTypes) {
      const entitled = proratedQuota(type.default_quota, employee.join_date, year);
      await prisma.leaveBalance.upsert({
        where: {
          employee_id_leave_type_id_year: {
            employee_id: employee.id,
            leave_type_id: type.id,
            year,
          },
        },
        update: { entitled },
        create: {
          employee_id: employee.id,
          leave_type_id: type.id,
          year,
          entitled,
          used: 0,
        },
      });
    }

    const hasHistory = await prisma.employmentHistory.findFirst({
      where: { employee_id: employee.id },
      select: { id: true },
    });

    if (!hasHistory) {
      await prisma.employmentHistory.create({
        data: {
          employee_id: employee.id,
          department: employee.department,
          role: employee.role,
          effective_date: employee.join_date,
          reason: "Data awal karyawan",
        },
      });
    }
  }

  const total = await prisma.employee.count();
  const totalUsers = await prisma.user.count();
  console.log(
    `✅ Seed selesai. Total karyawan: ${total}, total akun: ${totalUsers}`,
  );
  console.log("   admin@montreux.co / Admin123! (SUPER_ADMIN)");
  console.log("   hr@montreux.co / Hr123456! (HR_ADMIN)");
  console.log("   fajar.nugroho@montreux.co / Manager123! (MANAGER)");
  console.log("   alexander.wright@montreux.co / Employee123! (EMPLOYEE)");
  console.log("   siti.rahmawati@montreux.co / Employee123! (EMPLOYEE)");
}

main()
  .catch((error) => {
    console.error("🚨 Seed gagal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
