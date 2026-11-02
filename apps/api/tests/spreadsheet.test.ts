import type { Response } from "express";
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import {
  readSpreadsheet,
  sendCsv,
  sendXlsx,
} from "../src/lib/spreadsheet";

function fakeResponse() {
  const setHeader = vi.fn();
  const send = vi.fn();
  return {
    res: { setHeader, send } as unknown as Response,
    setHeader,
    send,
  };
}

async function buildWorkbook(rows: Array<Array<string | number | null>>) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("sendCsv", () => {
  it("mengirim CSV UTF-8 dengan BOM dan header attachment", () => {
    const { res, setHeader, send } = fakeResponse();

    sendCsv(res, "laporan cuti/2026.csv", ["Nama", "Jumlah"], [
      ["Siti Rahmawati", 2],
      ["Nilai, dengan koma", null],
      ['Kutip "ganda"', 0],
    ]);

    const types = setHeader.mock.calls.map(([key, value]) => [key, value]);
    expect(types).toContainEqual([
      "Content-Type",
      "text/csv; charset=utf-8",
    ]);
    expect(types).toContainEqual([
      "Content-Disposition",
      'attachment; filename="laporan_cuti_2026.csv"',
    ]);

    const body = send.mock.calls[0][0] as string;
    expect(body.startsWith("\uFEFF")).toBe(true);
    expect(body).toContain("Nama,Jumlah");
    expect(body).toContain('"Nilai, dengan koma",');
    expect(body).toContain('"Kutip ""ganda""",0');
  });
});

describe("sendXlsx", () => {
  it("mengirim buffer XLSX dengan header yang benar", async () => {
    const { res, setHeader, send } = fakeResponse();

    await sendXlsx(res, "karyawan.xlsx", "Karyawan", ["NIK", "Nama"], [
      ["3171", "Alexander"],
    ]);

    expect(setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      'attachment; filename="karyawan.xlsx"',
    );

    const buffer = send.mock.calls[0][0] as Buffer;
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(100);
  });

  it("memotong nama sheet maksimal 31 karakter", async () => {
    const { res } = fakeResponse();
    await expect(
      sendXlsx(res, "x.xlsx", "Nama Sheet Yang Sangat Panjang Sekali", ["A"], []),
    ).resolves.toBeUndefined();
  });
});

describe("readSpreadsheet", () => {
  it("membaca CSV standar", async () => {
    const csv = Buffer.from("NIK,Nama\n3171,Alexander\n3172,Siti\n", "utf8");
    expect(await readSpreadsheet(csv, "data.csv")).toEqual([
      ["NIK", "Nama"],
      ["3171", "Alexander"],
      ["3172", "Siti"],
    ]);
  });

  it("mendukung tanda kutip, koma di dalam field, dan pemisah titik koma", async () => {
    const csv = Buffer.from(
      'Nama;Alamat\n"Siti";"Jl. Merdeka, No. 1"\n"Kutip ""ganda""";Bandung\n',
      "utf8",
    );
    expect(await readSpreadsheet(csv, "data.CSV")).toEqual([
      ["Nama", "Alamat"],
      ["Siti", "Jl. Merdeka, No. 1"],
      ['Kutip "ganda"', "Bandung"],
    ]);
  });

  it("menangani baris baru di dalam field terkutip dan CRLF", async () => {
    const csv = Buffer.from('Nama,Catatan\r\n"Siti","baris 1\nbaris 2"\r\n', "utf8");
    expect(await readSpreadsheet(csv, "data.csv")).toEqual([
      ["Nama", "Catatan"],
      ["Siti", "baris 1\nbaris 2"],
    ]);
  });

  it("membaca XLSX termasuk tanggal dan sel kosong", async () => {
    const buffer = await buildWorkbook([
      ["NIK", "Nama", "Tanggal"],
      ["3171", "Alexander", new Date("2026-11-02T00:00:00.000Z")],
      [null, "Siti", null],
    ]);

    const rows = await readSpreadsheet(buffer, "data.xlsx");
    expect(rows[0]).toEqual(["NIK", "Nama", "Tanggal"]);
    expect(rows[1][0]).toBe("3171");
    expect(rows[1][2]).toBe("2026-11-02");
    expect(rows[2][1]).toBe("Siti");
  });

  it("menolak format file yang tidak didukung", async () => {
    await expect(
      readSpreadsheet(Buffer.from("x"), "data.pdf"),
    ).rejects.toThrow("Format file harus CSV atau XLSX.");
  });
});
