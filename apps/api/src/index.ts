import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { Prisma } from "@prisma/client";
import { prisma, pool } from "./lib/prisma";
import { CORS_ORIGINS, PORT } from "./lib/env";
import authRouter from "./routes/auth";
import employeesRouter from "./routes/employees";
import attendanceRouter from "./routes/attendance";
import leaveRouter from "./routes/leave";
import notificationsRouter from "./routes/notifications";
import auditRouter from "./routes/audit";
import settingsRouter from "./routes/settings";
import reportsRouter from "./routes/reports";

const app = express();

/**
 * Prisma hanya memberi nama kolom pada meta.target. Terjemahkan ke pesan
 * yang sesuai agar error absensi/saldo cuti tidak salah dilaporkan sebagai
 * "Email atau NIK sudah terdaftar".
 */
function duplicateMessage(target: unknown): string {
  const fields = Array.isArray(target)
    ? target.map((field) => String(field))
    : typeof target === "string"
      ? [target]
      : [];

  if (fields.includes("email")) return "Email sudah terdaftar.";
  if (fields.includes("nik")) return "NIK sudah terdaftar.";
  if (fields.includes("employee_id") && fields.includes("date")) {
    return "Data absensi untuk karyawan dan tanggal tersebut sudah ada.";
  }
  if (fields.includes("employee_id") && fields.includes("leave_type_id")) {
    return "Saldo cuti untuk karyawan dan jenis cuti tersebut sudah ada.";
  }
  if (fields.includes("code")) return "Kode sudah digunakan.";

  return "Data dengan nilai unik tersebut sudah terdaftar.";
}

// API tidak menyajikan HTML aplikasi, jadi CSP dinonaktifkan; header lain
// (nosniff, frame-ancestors, referrer policy) tetap aktif.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

app.disable("x-powered-by");

app.use(
  cors({
    // Saat development izinkan semua origin supaya akses lewat localhost,
    // 127.0.0.1, IPv6, atau IP LAN tidak menghasilkan "Failed to fetch".
    // Di production hanya origin pada CORS_ORIGIN yang diizinkan; jika daftar
    // kosong, request cross-origin ditolak (same-origin lewat proxy tetap aman).
    origin: process.env.NODE_ENV === "production" ? CORS_ORIGINS : true,
    // Refresh token dikirim lewat cookie httpOnly; browser hanya mau
    // menyimpannya jika response mengizinkan credentials.
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// Health check: memastikan API dan database siap dipakai.
app.get("/api/v1/health", async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: "ok",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("🚨 Health check gagal:", error);
    res.status(503).json({ status: "error", database: "unreachable" });
  }
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/employees", employeesRouter);
app.use("/api/v1/attendance", attendanceRouter);
app.use("/api/v1/leave", leaveRouter);
app.use("/api/v1/notifications", notificationsRouter);
app.use("/api/v1/audit-logs", auditRouter);
app.use("/api/v1/settings", settingsRouter);
app.use("/api/v1/reports", reportsRouter);

// 404 untuk endpoint yang tidak dikenal.
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan.`,
  });
});

// Error handler terpusat.
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("🚨 DETAIL ERROR API:", error);

  const meta = error as { code?: string; type?: string; message?: string };

  if (meta?.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "Ukuran file melebihi batas yang diizinkan." });
    return;
  }

  if (meta?.type === "entity.too.large") {
    res.status(413).json({ error: "Ukuran permintaan terlalu besar." });
    return;
  }

  // Body JSON yang tidak valid ditangani body-parser sebagai SyntaxError;
  // jangan sampai bocor menjadi 500.
  if (meta?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Format JSON pada permintaan tidak valid." });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      res.status(409).json({ error: duplicateMessage(error.meta?.target) });
      return;
    }
    if (error.code === "P2003") {
      res.status(400).json({ error: "Relasi data tidak valid." });
      return;
    }
    if (error.code === "P2025") {
      res.status(404).json({ error: "Data tidak ditemukan." });
      return;
    }
  }

  res.status(500).json({ error: "Terjadi kesalahan pada server." });
});

// Tanpa host eksplisit: Node memakai dual-stack (IPv6 + IPv4), sehingga
// localhost yang resolve ke ::1 maupun 127.0.0.1 sama-sama bisa diakses.
const server = app.listen(PORT, () => {
  console.log(`✅ Server API berjalan di http://localhost:${PORT}`);
});

async function shutdown(signal: string) {
  console.log(`\n${signal} diterima, menutup server...`);
  server.close(async () => {
    await prisma.$disconnect();
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
