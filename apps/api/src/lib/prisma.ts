import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { DATABASE_SSL, DATABASE_URL } from "./env";

// SSL hanya diaktifkan jika diminta lewat env. PostgreSQL lokal di Docker
// tidak menyediakan koneksi SSL, sehingga opsi ini harus mati secara default.
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
});

pool.on("error", (error) => {
  console.error("🚨 PostgreSQL pool error:", error);
});

export const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
export { pool };
