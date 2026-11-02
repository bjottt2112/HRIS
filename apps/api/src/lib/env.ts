import path from "path";
import dotenv from "dotenv";

// Selalu baca apps/api/.env, baik dijalankan lewat tsx (src/) maupun hasil build (dist/).
dotenv.config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

function readEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Environment variable ${name} belum di-set. Cek apps/api/.env`);
  }
  return value;
}

export const DATABASE_URL = readEnv("DATABASE_URL");
export const DATABASE_SSL = process.env.DATABASE_SSL === "true";
export const PORT = Number(process.env.PORT ?? 5000);
export const CORS_ORIGINS = (
  process.env.CORS_ORIGIN ??
  "http://localhost:3000,http://127.0.0.1:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const JWT_SECRET = readEnv("JWT_SECRET");
export const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL ?? "15m";
export const REFRESH_TOKEN_TTL_DAYS = Math.max(
  1,
  Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 7) || 7,
);
export const REFRESH_COOKIE_NAME =
  process.env.REFRESH_COOKIE_NAME ?? "hris_refresh";
export const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
