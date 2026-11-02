import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";

export const UPLOAD_ROOT = path.resolve(
  process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads"),
);

export const ALLOWED_MIME = new Map([
  ["application/pdf", ".pdf"],
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"],
]);

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

const IMPORT_MIME = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
]);

type FilterCallback = (error: Error | null, accepted?: boolean) => void;

/** Hanya PDF/gambar yang boleh menjadi lampiran cuti. */
export function attachmentFileFilter(
  _req: unknown,
  file: { mimetype: string },
  callback: FilterCallback,
): void {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    callback(new Error("Lampiran harus PDF, PNG, JPG, atau WEBP."));
    return;
  }
  callback(null, true);
}

/** Import karyawan hanya menerima CSV/XLSX. */
export function importFileFilter(
  _req: unknown,
  file: { originalname: string; mimetype?: string },
  callback: FilterCallback,
): void {
  const lower = file.originalname.toLowerCase();
  if (!lower.endsWith(".csv") && !lower.endsWith(".xlsx")) {
    callback(new Error("File harus berformat CSV atau XLSX."));
    return;
  }
  if (file.mimetype && !IMPORT_MIME.has(file.mimetype) && !lower.endsWith(".csv")) {
    callback(new Error("Tipe file tidak dikenali."));
    return;
  }
  callback(null, true);
}

/**
 * Upload disimpan di memori dulu, lalu ditulis ke folder dengan nama acak.
 * Ekstensi ditentukan dari MIME yang diizinkan (bukan dari nama file klien)
 * agar file berbahaya tidak bisa dieksekusi/disajikan sebagai HTML.
 */
export const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: attachmentFileFilter,
});

export const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_BYTES, files: 1 },
  fileFilter: importFileFilter,
});

export async function saveAttachment(
  buffer: Buffer,
  mimetype: string,
  subfolder = "leave",
): Promise<{ path: string; name: string }> {
  const extension = ALLOWED_MIME.get(mimetype);
  if (!extension) throw new Error("Tipe file tidak diizinkan.");

  const directory = path.join(UPLOAD_ROOT, subfolder);
  await fs.mkdir(directory, { recursive: true });

  const filename = `${randomUUID()}${extension}`;
  await fs.writeFile(path.join(directory, filename), buffer, { mode: 0o600 });

  return { path: path.join(subfolder, filename), name: filename };
}

export function resolveAttachment(relativePath: string): string | null {
  const absolute = path.resolve(UPLOAD_ROOT, relativePath);
  const root = path.resolve(UPLOAD_ROOT);

  // Cegah path traversal: file harus berada di dalam UPLOAD_ROOT.
  if (!absolute.startsWith(root + path.sep)) return null;
  return absolute;
}
