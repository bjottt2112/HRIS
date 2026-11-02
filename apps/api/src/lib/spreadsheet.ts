import ExcelJS from "exceljs";
import type { Response } from "express";

export type CellValue = string | number | null | undefined;

function csvEscape(value: CellValue): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Kirim CSV UTF-8 (BOM agar karakter Indonesia tampil benar di Excel). */
export function sendCsv(
  res: Response,
  filename: string,
  headers: string[],
  rows: CellValue[][],
): void {
  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(","));
  const body = `\uFEFF${lines.join("\r\n")}`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
  );
  res.send(body);
}

export async function sendXlsx(
  res: Response,
  filename: string,
  sheetName: string,
  headers: string[],
  rows: CellValue[][],
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Montreux HRIS";
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));

  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) sheet.addRow(row);

  sheet.columns.forEach((column) => {
    column.width = 20;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
  );
  res.send(Buffer.from(buffer));
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === "," || char === ";") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** Baca CSV/XLSX menjadi matriks string (baris pertama = header). */
export async function readSpreadsheet(
  buffer: Buffer,
  filename: string,
): Promise<string[][]> {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".csv")) {
    return parseCsv(buffer.toString("utf8"));
  }

  if (!lower.endsWith(".xlsx")) {
    throw new Error("Format file harus CSV atau XLSX.");
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      const value = cell.value;
      if (value === null || value === undefined) {
        values.push("");
      } else if (typeof value === "object" && "text" in value) {
        values.push(String((value as { text: unknown }).text ?? ""));
      } else if (value instanceof Date) {
        values.push(value.toISOString().slice(0, 10));
      } else {
        values.push(String(value).trim());
      }
    });
    rows.push(values);
  });

  return rows;
}
