import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import { APP_URL } from "./env";
import { hashPassword } from "./auth";
import { sendMail } from "./mailer";

export const RESET_TOKEN_TTL_MINUTES = 60;
const RESET_TOKEN_TTL_MS = RESET_TOKEN_TTL_MINUTES * 60 * 1000;

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Buat token reset password sekali pakai untuk sebuah email.
 * Selalu mengembalikan hasil yang sama di route (anti user enumeration);
 * token hanya dibuat jika email benar-benar terdaftar dan aktif.
 */
export async function createPasswordReset(
  email: string,
): Promise<{ email: string; link: string } | null> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, status: true },
  });

  if (!user || user.status !== "ACTIVE") return null;

  // Token lama yang belum dipakai tidak boleh tetap berlaku.
  await prisma.passwordResetToken.updateMany({
    where: { user_id: user.id, used_at: null },
    data: { used_at: new Date() },
  });

  const token = randomBytes(32).toString("base64url");

  await prisma.passwordResetToken.create({
    data: {
      user_id: user.id,
      token_hash: hashResetToken(token),
      expires_at: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  const link = `${APP_URL.replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(token)}`;

  await sendMail({
    to: user.email,
    subject: "Reset password Montreux HRIS",
    text: [
      "Kami menerima permintaan reset password untuk akun Anda.",
      "",
      `Buka tautan berikut dalam ${RESET_TOKEN_TTL_MINUTES} menit:`,
      link,
      "",
      "Tautan hanya dapat dipakai sekali. Jika Anda tidak meminta reset,",
      "abaikan email ini dan password Anda tidak akan berubah.",
    ].join("\n"),
    html: `<p>Kami menerima permintaan reset password untuk akun Anda.</p>
<p><a href="${link}">Reset password</a> (berlaku ${RESET_TOKEN_TTL_MINUTES} menit).</p>
<p>Tautan hanya dapat dipakai sekali. Jika Anda tidak meminta reset, abaikan email ini.</p>`,
  });

  return { email: user.email, link };
}

export type ResetResult =
  | { ok: true; email: string }
  | { ok: false; reason: "INVALID" | "EXPIRED" | "USED" };

/**
 * Pakai token reset: verifikasi, ganti password, dan cabut seluruh sesi.
 * Token ditandai terpakai di dalam transaksi agar tidak bisa dipakai dua kali.
 */
export async function consumePasswordReset(
  token: string,
  newPassword: string,
): Promise<ResetResult> {
  if (!token || token.length < 20) return { ok: false, reason: "INVALID" };

  const record = await prisma.passwordResetToken.findUnique({
    where: { token_hash: hashResetToken(token) },
    include: { user: { select: { id: true, email: true, status: true } } },
  });

  if (!record) return { ok: false, reason: "INVALID" };
  if (record.used_at) return { ok: false, reason: "USED" };
  if (record.expires_at.getTime() <= Date.now()) {
    return { ok: false, reason: "EXPIRED" };
  }
  if (record.user.status !== "ACTIVE") return { ok: false, reason: "INVALID" };

  const passwordHash = await hashPassword(newPassword);

  const claimed = await prisma.passwordResetToken.updateMany({
    where: { id: record.id, used_at: null },
    data: { used_at: new Date() },
  });

  if (claimed.count === 0) return { ok: false, reason: "USED" };

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.user_id },
      data: { password_hash: passwordHash },
    }),
    prisma.refreshToken.updateMany({
      where: { user_id: record.user_id, revoked_at: null },
      data: { revoked_at: new Date() },
    }),
    prisma.passwordResetToken.updateMany({
      where: { user_id: record.user_id, used_at: null },
      data: { used_at: new Date() },
    }),
  ]);

  return { ok: true, email: record.user.email };
}
