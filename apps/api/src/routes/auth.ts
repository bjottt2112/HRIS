import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import {
  createRefreshToken,
  hashPassword,
  hashRefreshToken,
  isLegacyPasswordHash,
  signToken,
  verifyPassword,
  type AuthRole,
} from "../lib/auth";
import {
  REFRESH_COOKIE_NAME,
  REFRESH_TOKEN_TTL_DAYS,
} from "../lib/env";
import { getOrCreateCompany } from "../lib/company";
import { mailConfigured } from "../lib/mailer";
import {
  consumePasswordReset,
  createPasswordReset,
} from "../lib/password-reset";
import { writeAudit } from "../lib/audit";
import {
  clearLoginFailures,
  loginThrottle,
  recordLoginFailure,
} from "../lib/rate-limit";
import { asString, isEmail } from "../lib/validation";
import { requireAuth } from "../middleware/auth";

const router = Router();

const REFRESH_COOKIE_PATH = "/api/v1/auth";
const REFRESH_TTL_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

type UserWithEmployee = Awaited<ReturnType<typeof findUserById>>;

async function findUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: { employee: true },
  });
}

function toPublicUser(user: NonNullable<UserWithEmployee>) {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? user.employee?.name ?? user.email.split("@")[0],
    role: user.role,
    status: user.status,
    employeeId: user.employee?.id ?? null,
    department: user.employee?.department ?? null,
    jobTitle: user.employee?.role ?? null,
  };
}

function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: REFRESH_COOKIE_PATH,
    maxAge: maxAgeMs,
  };
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;

    const key = part.slice(0, separator).trim();
    if (key !== name) continue;

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }

  return null;
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
}

async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { user_id: userId, revoked_at: null },
    data: { revoked_at: new Date() },
  });
}

/** Terbitkan access token + refresh token (cookie httpOnly) untuk sesi baru. */
async function issueSession(
  req: Request,
  res: Response,
  user: NonNullable<UserWithEmployee>,
): Promise<string> {
  const token = signToken({
    sub: user.id,
    email: user.email,
    role: user.role as AuthRole,
  });

  const { token: refreshToken, tokenHash } = createRefreshToken();

  await prisma.refreshToken.create({
    data: {
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + REFRESH_TTL_MS),
      user_agent: req.get("user-agent") ?? null,
      ip: req.ip ?? null,
    },
  });

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, cookieOptions(REFRESH_TTL_MS));
  return token;
}

// POST /api/v1/auth/register
router.post("/register", async (req: Request, res: Response) => {
  const name = asString(req.body?.name);
  const email = asString(req.body?.email)?.toLowerCase();
  const password = asString(req.body?.password);
  const nik = asString(req.body?.nik);
  const department = asString(req.body?.department) ?? "General";
  const jobTitle =
    asString(req.body?.jobTitle) ?? asString(req.body?.role) ?? "Staff";

  if (!name || !email || !password || !nik) {
    res
      .status(400)
      .json({ error: "Nama, email, password, dan NIK wajib diisi." });
    return;
  }

  if (!isEmail(email)) {
    res.status(400).json({ error: "Format email tidak valid." });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: "Password minimal 8 karakter." });
    return;
  }

  if (password.length > 128) {
    res.status(400).json({ error: "Password maksimal 128 karakter." });
    return;
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    res.status(409).json({ error: "Email sudah terdaftar. Silakan login." });
    return;
  }

  const passwordHash = await hashPassword(password);
  const existingEmployeeEmail = await prisma.employee.findUnique({
    where: { email },
  });

  // Karyawan yang sudah didaftarkan HR bisa mengklaim akunnya sendiri.
  // Verifikasi memakai NIK agar orang lain tidak bisa mengambil alih data.
  const canClaimExistingEmployee =
    existingEmployeeEmail &&
    !existingEmployeeEmail.user_id &&
    existingEmployeeEmail.nik === nik;

  if (existingEmployeeEmail && !canClaimExistingEmployee) {
    res.status(409).json({
      error:
        existingEmployeeEmail.user_id && existingEmployeeEmail.nik === nik
          ? "Akun untuk email ini sudah dibuat. Silakan login."
          : "Email sudah terdaftar sebagai karyawan, tetapi NIK tidak cocok. Hubungi HR untuk bantuan.",
    });
    return;
  }

  if (!existingEmployeeEmail) {
    const existingNik = await prisma.employee.findUnique({ where: { nik } });
    if (existingNik) {
      res.status(409).json({ error: "NIK sudah terdaftar." });
      return;
    }
  }

  const company = await getOrCreateCompany();

  const user = await prisma.user.create({
    data: {
      email,
      name,
      password_hash: passwordHash,
      role: "EMPLOYEE",
      status: "ACTIVE",
      ...(existingEmployeeEmail
        ? {
            employee: {
              connect: { id: existingEmployeeEmail.id },
            },
          }
        : {
            employee: {
              create: {
                company_id: company.id,
                nik,
                name,
                email,
                department,
                role: jobTitle,
                employment: "Full-time",
                location: "Jakarta, ID",
                join_date: new Date(),
                status: "Active",
              },
            },
          }),
    },
    include: { employee: true },
  });

  const token = await issueSession(req, res, user);

  res.status(201).json({ token, user: toPublicUser(user) });
});

// POST /api/v1/auth/login
router.post("/login", async (req: Request, res: Response) => {
  const email = asString(req.body?.email)?.toLowerCase();
  const password = asString(req.body?.password);

  if (!email || !password) {
    res.status(400).json({ error: "Email dan password wajib diisi." });
    return;
  }

  const throttleKey = `login:${email}:${req.ip ?? "unknown"}`;
  const throttle = loginThrottle(throttleKey);

  if (throttle.blocked) {
    res.setHeader("Retry-After", String(throttle.retryAfterSeconds));
    res.status(429).json({
      error: `Terlalu banyak percobaan login. Coba lagi dalam ${Math.max(
        1,
        Math.ceil(throttle.retryAfterSeconds / 60),
      )} menit.`,
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { employee: true },
  });

  if (!user) {
    recordLoginFailure(throttleKey);
    res.status(401).json({ error: "Email atau password salah." });
    return;
  }

  // Verifikasi password lebih dulu agar status akun tidak bisa ditebak
  // hanya dengan mencoba login memakai password sembarang.
  const passwordMatches =
    password.length <= 128 &&
    (await verifyPassword(password, user.password_hash));
  if (!passwordMatches) {
    recordLoginFailure(throttleKey);
    await writeAudit({
      actorId: user.id,
      action: "auth.login_failed",
      entity: "User",
      entityId: user.id,
      ip: req.ip,
    });
    res.status(401).json({ error: "Email atau password salah." });
    return;
  }

  if (user.status !== "ACTIVE") {
    res.status(403).json({ error: "Akun Anda tidak aktif." });
    return;
  }

  clearLoginFailures(throttleKey);

  // Bersihkan token kedaluwarsa, lalu upgrade hash bcrypt lama ke Argon2id.
  await prisma.refreshToken.deleteMany({
    where: { expires_at: { lt: new Date() } },
  });

  if (isLegacyPasswordHash(user.password_hash)) {
    const upgradedHash = await hashPassword(password);
    await prisma.user.update({
      where: { id: user.id },
      data: { password_hash: upgradedHash, last_login: new Date() },
    });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { last_login: new Date() },
    });
  }

  const token = await issueSession(req, res, user);

  await writeAudit({
    actorId: user.id,
    action: "auth.login",
    entity: "User",
    entityId: user.id,
    ip: req.ip,
  });

  res.json({ token, user: toPublicUser(user) });
});

// POST /api/v1/auth/forgot-password
router.post("/forgot-password", async (req: Request, res: Response) => {
  const email = asString(req.body?.email)?.toLowerCase();

  if (!email || !isEmail(email)) {
    res.status(400).json({ error: "Format email tidak valid." });
    return;
  }

  const throttleKey = `forgot:${email}:${req.ip ?? "unknown"}`;
  const throttle = loginThrottle(throttleKey, 3);

  if (throttle.blocked) {
    res.setHeader("Retry-After", String(throttle.retryAfterSeconds));
    res.status(429).json({
      error: "Terlalu banyak permintaan reset. Coba lagi beberapa menit lagi.",
    });
    return;
  }

  recordLoginFailure(throttleKey);

  const created = await createPasswordReset(email);

  if (created) {
    await writeAudit({
      actorId: null,
      action: "auth.password_reset_requested",
      entity: "User",
      entityId: null,
      newValues: { email },
      ip: req.ip,
    });
  }

  // Respons selalu sama agar penyerang tidak bisa menebak email terdaftar.
  res.json({
    ok: true,
    message:
      "Jika email terdaftar, tautan reset password sudah dikirim. Periksa kotak masuk Anda.",
    // Hanya untuk pengembangan lokal tanpa SMTP, agar alur bisa diuji.
    ...(created && !mailConfigured() && process.env.NODE_ENV !== "production"
      ? { devResetLink: created.link }
      : {}),
  });
});

// POST /api/v1/auth/reset-password
router.post("/reset-password", async (req: Request, res: Response) => {
  const token = asString(req.body?.token);
  const password = asString(req.body?.password);

  if (!token) {
    res.status(400).json({ error: "Token reset tidak valid." });
    return;
  }

  if (!password || password.length < 8) {
    res.status(400).json({ error: "Password minimal 8 karakter." });
    return;
  }

  if (password.length > 128) {
    res.status(400).json({ error: "Password maksimal 128 karakter." });
    return;
  }

  const result = await consumePasswordReset(token, password);

  if (!result.ok) {
    const message =
      result.reason === "EXPIRED"
        ? "Tautan reset sudah kedaluwarsa. Silakan minta tautan baru."
        : result.reason === "USED"
          ? "Tautan reset sudah pernah dipakai. Silakan minta tautan baru."
          : "Tautan reset tidak valid.";
    res.status(400).json({ error: message });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: result.email } });

  await writeAudit({
    actorId: user?.id ?? null,
    action: "auth.password_reset",
    entity: "User",
    entityId: user?.id ?? null,
    ip: req.ip,
  });

  res.json({
    ok: true,
    message: "Password berhasil diperbarui. Silakan login dengan password baru.",
  });
});

// POST /api/v1/auth/refresh — rotasi refresh token.
router.post("/refresh", async (req: Request, res: Response) => {
  const rawToken = readCookie(req, REFRESH_COOKIE_NAME);

  if (!rawToken) {
    res.status(401).json({ error: "Sesi tidak ditemukan. Silakan login." });
    return;
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { token_hash: hashRefreshToken(rawToken) },
    include: { user: { include: { employee: true } } },
  });

  if (!stored) {
    clearRefreshCookie(res);
    res.status(401).json({ error: "Sesi tidak valid. Silakan login kembali." });
    return;
  }

  // Token yang sudah pernah dipakai (rotated) menandakan kemungkinan
  // penyalahgunaan: cabut seluruh sesi milik pengguna tersebut.
  if (stored.revoked_at) {
    await revokeAllSessions(stored.user_id);
    clearRefreshCookie(res);
    res.status(401).json({
      error: "Sesi sudah tidak berlaku. Silakan login kembali.",
    });
    return;
  }

  if (stored.expires_at.getTime() <= Date.now()) {
    clearRefreshCookie(res);
    res.status(401).json({ error: "Sesi kedaluwarsa. Silakan login kembali." });
    return;
  }

  if (stored.user.status !== "ACTIVE") {
    await revokeAllSessions(stored.user_id);
    clearRefreshCookie(res);
    res.status(403).json({ error: "Akun Anda tidak aktif." });
    return;
  }

  const { token: newRefreshToken, tokenHash } = createRefreshToken();

  // Conditional update mencegah dua request paralel memakai token yang sama.
  const rotated = await prisma.refreshToken.updateMany({
    where: { id: stored.id, revoked_at: null },
    data: { revoked_at: new Date() },
  });

  if (rotated.count === 0) {
    await revokeAllSessions(stored.user_id);
    clearRefreshCookie(res);
    res.status(401).json({
      error: "Sesi sudah tidak berlaku. Silakan login kembali.",
    });
    return;
  }

  await prisma.refreshToken.create({
    data: {
      user_id: stored.user_id,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + REFRESH_TTL_MS),
      user_agent: req.get("user-agent") ?? null,
      ip: req.ip ?? null,
    },
  });

  res.cookie(
    REFRESH_COOKIE_NAME,
    newRefreshToken,
    cookieOptions(REFRESH_TTL_MS),
  );

  const token = signToken({
    sub: stored.user.id,
    email: stored.user.email,
    role: stored.user.role as AuthRole,
  });

  res.json({ token, user: toPublicUser(stored.user) });
});

// POST /api/v1/auth/logout — cabut refresh token aktif.
router.post("/logout", async (req: Request, res: Response) => {
  const rawToken = readCookie(req, REFRESH_COOKIE_NAME);

  if (rawToken) {
    await prisma.refreshToken.updateMany({
      where: {
        token_hash: hashRefreshToken(rawToken),
        revoked_at: null,
      },
      data: { revoked_at: new Date() },
    });
  }

  clearRefreshCookie(res);
  res.json({ ok: true });
});

// GET /api/v1/auth/me
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const user = await findUserById(req.auth!.sub);

  if (!user || user.status !== "ACTIVE") {
    res.status(401).json({ error: "Sesi login tidak valid." });
    return;
  }

  res.json({ user: toPublicUser(user) });
});

export default router;
