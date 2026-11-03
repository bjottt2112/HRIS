"use client";

import React, { useEffect, useState } from "react";
import { Icons } from "./Icons";
import { apiFetch } from "../lib/api";
import { formatDate } from "../lib/format";
import type {
  EmployeeRow,
  EmploymentHistoryItem,
  SettingsBootstrap,
} from "../lib/types";

interface EmployeeDetailModalProps {
  employee: EmployeeRow;
  canManage: boolean;
  deleting?: boolean;
  onEdit: (employee: EmployeeRow) => void;
  onDelete: (employee: EmployeeRow) => void;
  onClose: () => void;
}

export default function EmployeeDetailModal({
  employee,
  canManage,
  deleting = false,
  onEdit,
  onDelete,
  onClose,
}: EmployeeDetailModalProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [history, setHistory] = useState<EmploymentHistoryItem[]>([]);
  const [settings, setSettings] = useState<SettingsBootstrap | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const [historyData, bootstrap] = await Promise.all([
            apiFetch<EmploymentHistoryItem[]>(
              `/api/v1/employees/${employee.id}/history`,
            ),
            apiFetch<SettingsBootstrap>("/api/v1/settings/bootstrap"),
          ]);
          setHistory(historyData);
          setSettings(bootstrap);
        } catch {
          // Riwayat opsional.
        }
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [employee.id]);

  const scheduleName =
    settings?.schedules.find((item) => item.id === employee.schedule_id)?.name ??
    "-";
  const workLocationName =
    settings?.locations.find((item) => item.id === employee.work_location_id)
      ?.name ?? "-";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-modal">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between border-b pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-full ${employee.avatarBg} font-bold text-base flex items-center justify-center`}
            >
              {employee.initials}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {employee.name}
              </h3>
              <p className="text-xs text-slate-400">
                {employee.role} • {employee.department}
              </p>
            </div>
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

        <div className="grid grid-cols-2 gap-3 text-xs mb-4">
          <div>
            <span className="text-slate-400 block">Email</span>
            <span className="font-semibold text-slate-800">{employee.email}</span>
          </div>
          <div>
            <span className="text-slate-400 block">Telepon</span>
            <span className="font-semibold text-slate-800">
              {employee.phone ?? "-"}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block">Status</span>
            <span className="font-semibold text-slate-800">{employee.status}</span>
          </div>
          <div>
            <span className="text-slate-400 block">Tipe Kepegawaian</span>
            <span className="font-semibold text-slate-800">
              {employee.employment}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block">Lokasi</span>
            <span className="font-semibold text-slate-800">
              {employee.location}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block">Tanggal Masuk</span>
            <span className="font-semibold text-slate-800">
              {formatDate(employee.join_date)}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block">Jadwal Kerja</span>
            <span className="font-semibold text-slate-800">{scheduleName}</span>
          </div>
          <div>
            <span className="text-slate-400 block">Lokasi Absensi</span>
            <span className="font-semibold text-slate-800">{workLocationName}</span>
          </div>
          <div className="col-span-2">
            <span className="text-slate-400 block">Alamat</span>
            <span className="font-semibold text-slate-800">
              {employee.address ?? "-"}
            </span>
          </div>
          <div className="col-span-2">
            <span className="text-slate-400 block">Kontak Darurat</span>
            <span className="font-semibold text-slate-800">
              {employee.emergency_name ?? "-"}
              {employee.emergency_phone
                ? ` • ${employee.emergency_phone}`
                : ""}
            </span>
          </div>
        </div>

        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <Icons.Shield /> Sensitive Data (UU PDP)
            </span>
            <span className="text-[10px] font-semibold text-slate-400">
              {canManage ? "Terbuka untuk HR" : "Dimasking otomatis"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block">NIK</span>
              <span className="font-mono font-semibold">{employee.nik}</span>
            </div>
            <div>
              <span className="text-slate-400 block">NPWP</span>
              <span className="font-mono font-semibold">
                {employee.npwp ?? "-"}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">BPJS</span>
              <span className="font-mono font-semibold">
                {employee.bpjs ?? "-"}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Rekening Bank</span>
              <span className="font-mono font-semibold">
                {employee.bank_account ?? "-"}
              </span>
            </div>
          </div>
        </div>

        {history.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-bold text-slate-700 mb-2">
              Riwayat Jabatan
            </h4>
            <ul className="space-y-1.5 text-[11px]">
              {history.slice(0, 6).map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-2 bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2"
                >
                  <div>
                    <p className="font-semibold text-slate-800">
                      {item.role} · {item.department}
                    </p>
                    <p className="text-slate-500">{item.reason ?? "Perubahan data"}</p>
                  </div>
                  <span className="text-slate-400 shrink-0">
                    {formatDate(item.effective_date)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {canManage && (
            <>
              <button
                type="button"
                onClick={() => onEdit(employee)}
                className="px-4 py-2 bg-slate-900 text-white font-semibold rounded-xl text-xs hover:bg-slate-800"
              >
                Ubah Data
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                    return;
                  }
                  onDelete(employee);
                }}
                className="px-4 py-2 bg-rose-50 text-rose-600 border border-rose-200 font-semibold rounded-xl text-xs hover:bg-rose-100 disabled:opacity-60"
              >
                {deleting
                  ? "Menghapus..."
                  : confirmDelete
                    ? "Yakin hapus?"
                    : "Hapus"}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 text-slate-700 font-semibold rounded-xl text-xs"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
