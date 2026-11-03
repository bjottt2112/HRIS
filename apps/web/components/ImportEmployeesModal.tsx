"use client";

import React, { useState } from "react";
import { Icons } from "./Icons";
import { apiDownload, apiUpload } from "../lib/api";
import type { ImportPreview, ImportResult } from "../lib/types";

interface ImportEmployeesModalProps {
  onClose: () => void;
  onImported: () => Promise<void> | void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

const ACTION_STYLE: Record<string, string> = {
  create: "bg-emerald-50 text-emerald-700 border-emerald-200",
  update: "bg-sky-50 text-sky-700 border-sky-200",
  error: "bg-rose-50 text-rose-700 border-rose-200",
};

export default function ImportEmployeesModal({
  onClose,
  onImported,
  onError,
  onSuccess,
}: ImportEmployeesModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const runPreview = async () => {
    if (!file) {
      onError("Pilih file CSV atau XLSX terlebih dahulu.");
      return;
    }

    setBusy(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const data = await apiUpload<ImportPreview>(
        "/api/v1/employees/import/preview",
        formData,
      );
      setPreview(data);
    } catch (error) {
      setPreview(null);
      onError(error instanceof Error ? error.message : "Gagal membaca file.");
    } finally {
      setBusy(false);
    }
  };

  const runCommit = async () => {
    if (!file) return;

    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const data = await apiUpload<ImportResult>(
        "/api/v1/employees/import/commit",
        formData,
      );
      setResult(data);
      setPreview(null);
      await onImported();
      onSuccess(
        `Import selesai: ${data.created} dibuat, ${data.updated} diperbarui, ${data.skippedCount} dilewati.`,
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : "Gagal mengimpor data.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-modal">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between border-b pb-4 mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Import Karyawan</h3>
            <p className="text-[11px] text-slate-400">
              Unggah CSV/XLSX, tinjau hasil validasi, lalu simpan. Baris dengan
              error dilewati.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Tutup"
          >
            <Icons.X />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => void apiDownload("/api/v1/employees/import/template?format=xlsx", "template-karyawan.xlsx")}
            className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Unduh template XLSX
          </button>
          <button
            type="button"
            onClick={() => void apiDownload("/api/v1/employees/import/template?format=csv", "template-karyawan.csv")}
            className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Unduh template CSV
          </button>
        </div>

        <input
          type="file"
          accept=".csv,.xlsx"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setPreview(null);
            setResult(null);
          }}
          className="block w-full text-xs text-slate-600 border border-slate-200 rounded-xl p-2.5 mb-4"
        />

        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            disabled={busy || !file}
            onClick={() => void runPreview()}
            className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 disabled:opacity-60"
          >
            {busy && !preview ? "Memeriksa..." : "Preview & Validasi"}
          </button>
          <button
            type="button"
            disabled={busy || !file || !preview || preview.createCount + preview.updateCount === 0}
            onClick={() => void runCommit()}
            className="px-4 py-2 bg-brand-accent text-white text-xs font-semibold rounded-xl hover:bg-rose-600 disabled:opacity-60"
          >
            {busy && preview ? "Menyimpan..." : "Simpan ke Database"}
          </button>
        </div>

        {preview && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-2 mb-2 text-[11px] font-semibold">
              <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200">
                Total: {preview.total}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700">
                Baru: {preview.createCount}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-700">
                Update: {preview.updateCount}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">
                Error: {preview.errorCount}
              </span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider sticky top-0">
                  <tr>
                    <th className="px-3 py-2">Baris</th>
                    <th className="px-3 py-2">Aksi</th>
                    <th className="px-3 py-2">NIK</th>
                    <th className="px-3 py-2">Nama</th>
                    <th className="px-3 py-2">Catatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.map((row) => (
                    <tr key={row.line}>
                      <td className="px-3 py-1.5 text-slate-500">{row.line}</td>
                      <td className="px-3 py-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-full border font-bold text-[10px] ${ACTION_STYLE[row.action]}`}
                        >
                          {row.action}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-mono">{row.nik}</td>
                      <td className="px-3 py-1.5">{row.name}</td>
                      <td className="px-3 py-1.5 text-rose-600">
                        {row.errors.join(" ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {result && (
          <div className="text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
            <p className="font-semibold text-slate-800">
              {result.created} dibuat, {result.updated} diperbarui,{" "}
              {result.skippedCount} dilewati.
            </p>
            {result.skipped.map((item) => (
              <p key={item.line} className="text-rose-600">
                Baris {item.line}: {item.errors.join(" ")}
              </p>
            ))}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
