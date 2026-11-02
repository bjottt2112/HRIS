import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  ALLOWED_MIME,
  MAX_IMPORT_BYTES,
  MAX_UPLOAD_BYTES,
  UPLOAD_ROOT,
  attachmentFileFilter,
  importFileFilter,
  resolveAttachment,
  saveAttachment,
} from "../src/lib/uploads";

function filterCall(
  filter: (
    req: unknown,
    file: { mimetype?: string; originalname?: string },
    callback: (error: Error | null, accepted?: boolean) => void,
  ) => void,
  file: { mimetype?: string; originalname?: string },
) {
  const callback = vi.fn();
  filter({}, file, callback);
  return callback;
}

afterAll(async () => {
  await fs.rm(UPLOAD_ROOT, { recursive: true, force: true });
});

describe("konfigurasi upload", () => {
  it("menetapkan batas ukuran 5 MB lampiran dan 10 MB import", () => {
    expect(MAX_UPLOAD_BYTES).toBe(5 * 1024 * 1024);
    expect(MAX_IMPORT_BYTES).toBe(10 * 1024 * 1024);
  });

  it("hanya memetakan MIME yang aman ke ekstensi", () => {
    expect([...ALLOWED_MIME.values()].sort()).toEqual([
      ".jpg",
      ".pdf",
      ".png",
      ".webp",
    ]);
    expect(ALLOWED_MIME.has("text/html")).toBe(false);
  });
});

describe("attachmentFileFilter", () => {
  it("menerima PDF dan gambar", () => {
    const callback = filterCall(attachmentFileFilter, {
      mimetype: "application/pdf",
    });
    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it("menolak tipe lain", () => {
    const callback = filterCall(attachmentFileFilter, {
      mimetype: "text/html",
    });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});

describe("importFileFilter", () => {
  it("menerima CSV dan XLSX", () => {
    expect(
      filterCall(importFileFilter, {
        originalname: "karyawan.csv",
        mimetype: "text/csv",
      }),
    ).toHaveBeenCalledWith(null, true);
    expect(
      filterCall(importFileFilter, {
        originalname: "KARYAWAN.XLSX",
        mimetype:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    ).toHaveBeenCalledWith(null, true);
    expect(
      filterCall(importFileFilter, {
        originalname: "data.csv",
        mimetype: "application/octet-stream",
      }),
    ).toHaveBeenCalledWith(null, true);
  });

  it("menolak ekstensi lain", () => {
    const callback = filterCall(importFileFilter, {
      originalname: "data.exe",
      mimetype: "application/octet-stream",
    });
    expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it("menolak MIME yang tidak dikenali untuk XLSX", () => {
    const callback = filterCall(importFileFilter, {
      originalname: "data.xlsx",
      mimetype: "text/html",
    });
    expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});

describe("saveAttachment", () => {
  it("menyimpan file dengan nama acak dan ekstensi dari MIME", async () => {
    const buffer = Buffer.from("isi-lampiran");
    const saved = await saveAttachment(buffer, "image/png");

    expect(saved.name).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(saved.path.startsWith("leave")).toBe(true);

    const absolute = resolveAttachment(saved.path);
    expect(absolute).not.toBeNull();
    expect(await fs.readFile(absolute!, "utf8")).toBe("isi-lampiran");
  });

  it("menolak MIME yang tidak diizinkan", async () => {
    await expect(
      saveAttachment(Buffer.from("x"), "text/html"),
    ).rejects.toThrow("Tipe file tidak diizinkan.");
  });
});

describe("resolveAttachment", () => {
  it("mengizinkan file di dalam folder upload", () => {
    const resolved = resolveAttachment("leave/file.pdf");
    expect(resolved).toBe(path.join(UPLOAD_ROOT, "leave", "file.pdf"));
  });

  it("menolak path traversal", () => {
    expect(resolveAttachment("../.env")).toBeNull();
    expect(resolveAttachment("../../etc/passwd")).toBeNull();
    expect(resolveAttachment("leave/../../secret.png")).toBeNull();
  });
});
