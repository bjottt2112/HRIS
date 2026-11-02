import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Algorithm, hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { compare } from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { ACCESS_TOKEN_TTL, JWT_SECRET } from "./env";

export type AuthRole = "SUPER_ADMIN" | "HR_ADMIN" | "MANAGER" | "EMPLOYEE";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: AuthRole;
}

// Parameter OWASP untuk Argon2id (minimum 19 MiB, t=2, p=1).
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argonHash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  try {
    if (passwordHash.startsWith("$argon2")) {
      return await argonVerify(passwordHash, password);
    }

    // Kompatibilitas hash lama (bcrypt) supaya pengguna existing tetap bisa
    // login; hash akan di-upgrade ke Argon2id setelah login berhasil.
    if (passwordHash.startsWith("$2")) {
      return await compare(password, passwordHash);
    }

    return false;
  } catch {
    return false;
  }
}

/** Hash bcrypt lama yang perlu di-upgrade ke Argon2id. */
export function isLegacyPasswordHash(passwordHash: string): boolean {
  return passwordHash.startsWith("$2");
}

export function signToken(payload: AuthTokenPayload): string {
  const options: SignOptions = {
    expiresIn: ACCESS_TOKEN_TTL as SignOptions["expiresIn"],
    algorithm: "HS256",
  };
  return jwt.sign({ ...payload, jti: randomUUID() }, JWT_SECRET, options);
}

export function verifyToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, JWT_SECRET);

  if (typeof decoded === "string" || !decoded.sub) {
    throw new Error("Token tidak valid.");
  }

  return {
    sub: String(decoded.sub),
    email: String(decoded.email ?? ""),
    role: decoded.role as AuthRole,
  };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Token refresh acak; hanya hash SHA-256 yang disimpan di database. */
export function createRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(48).toString("base64url");
  return { token, tokenHash: hashRefreshToken(token) };
}
