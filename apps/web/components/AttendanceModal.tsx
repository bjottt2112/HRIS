"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Icons } from "./Icons";
import { todayLabel } from "../lib/format";
import { apiDownload, apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import type {
  AttendanceCorrection,
  AttendanceRecord,
  AttendanceSummaryRow,
} from "../lib/types";

interface AttendanceModalProps {
  onClose: () => void;
  onChanged?: () => void;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function formatTime(value: string | null): string {
  if (!value) return "--:--";
  return new Date(value).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

type Tab = "clock" | "corrections" | "summary";

const CORRECTION_STYLE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-rose-50 text-rose-700 border-rose-200",
};

async function getCoordinates(): Promise<{ latitude: number; longitude: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  });
}

export default function AttendanceModal({
  onClose,
  onChanged,
}: AttendanceModalProps) {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("clock");
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [corrections, setCorrections] = useState<AttendanceCorrection[]>([]);
  const [summary, setSummary] = useState<AttendanceSummaryRow[]>([]);
  const [month, setMonth] = useState(currentMonth());
  const [workMode, setWorkMode] = useState("OFFICE");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isHr = user?.role === "SUPER_ADMIN" || user?.role === "HR_ADMIN";
  const canReview = isHr || user?.role === "MANAGER";

  const load = useCallback(async () => {
    try {
      const [today, correctionData, summaryData] = await Promise.all([
        apiFetch<AttendanceRecord[]>("/api/v1/attendance/today"),
        apiFetch<AttendanceCorrection[]>("/api/v1/attendance/corrections"),
        apiFetch<{ month: string; employees: AttendanceSummaryRow[] }>(
          `/api/v1/attendance/summary?month=${month}`,
        ),
      ]);
      setRecords(today);
      setCorrections(correctionData);
      setSummary(summaryData.employees);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Gagal memuat absensi.",
      );
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  const own = records.find((record) => record.employeeId === user?.employeeId);

  const submitClock = async (action: "clock-in" | "clock-out") => {
    setError(null);
    setSubmitting(true);

    try {
      const coordinates =
        action === "clock-in" ? await getCoordinates() : null;

      await apiFetch(`/api/v1/attendance/${action}`, {
        method: "POST",
        body: JSON.stringify({
          workMode,
          ...(coordinates ?? {}),
        }),
      });
      await load();
      onChanged?.();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Gagal menyimpan absensi.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const submitCorrection = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = event.currentTarget;
    const formData = new FormData(form);

    const toIso = (key: string): string | undefined => {
      const value = String(formData.get(key) ?? "");
      return value ? new Date(value).toISOString() : undefined;
    };

    try {
      await apiFetch("/api/v1/attendance/corrections", {
        method: "POST",
        body: JSON.stringify({
          date: String(formData.get("date") ?? ""),
          reason: String(formData.get("reason") ?? "").trim(),
          requestedClockIn: toIso("requestedClockIn"),
          requestedClockOut: toIso("requestedClockOut"),
        }),
      });
      form.reset();
      await load();
      onChanged?.();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Gagal mengirim koreksi.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const decideCorrection = async (
    id: string,
    status: "APPROVED" | "REJECTED",
  ) => {
    setError(null);
    try {
      await apiFetch(`/api/v1/attendance/corrections/${id}/decision`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
      onChanged?.();
    } catch (decisionError) {
      setError(
        decisionError instanceof Error
          ? decisionError.message
          : "Gagal memproses koreksi.",
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-modal">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b pb-4 mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Attendance</h3>
            <p className="text-[11px] text-slate-400">{todayLabel()}</p>
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

        <div className="flex flex-wrap gap-2 mb-4">
          {(
            [
              ["clock", "Absen Hari Ini"],
              ["corrections", "Koreksi"],
              ["summary", "Rekap Bulanan"],
            ] as Array<[Tab, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                tab === key
                  ? "bg-rose-50 border-rose-200 text-rose-700"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-rose-600 font-medium bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-xs mb-4">
            {error}
          </p>
        )}

        {tab === "clock" && (
          <>
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs font-semibold text-slate-700">
                    {user?.name ?? "Saya"}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {own
                      ? `${formatTime(own.clockIn)} — ${formatTime(own.clockOut)} WIB · ${own.workMode ?? "OFFICE"}`
                      : "Belum clock in hari ini"}
                  </p>
                </div>
                {own && (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                      own.status === "Late"
                        ? "bg-amber-50 text-amber-600 border-amber-200"
                        : "bg-emerald-50 text-emerald-600 border-emerald-200"
                    }`}
                  >
                    {own.status}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={workMode}
                  onChange={(event) => setWorkMode(event.target.value)}
                  className="px-3 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 bg-white"
                >
                  <option value="OFFICE">Di Kantor</option>
                  <option value="WFH">WFH</option>
                  <option value="FIELD">Lapangan</option>
                </select>
                <button
                  type="button"
                  disabled={submitting || Boolean(own)}
                  onClick={() => void submitClock("clock-in")}
                  className="flex items-center gap-2 px-4 py-2.5 bg-brand-accent text-white text-xs font-semibold rounded-xl hover:bg-rose-600 disabled:opacity-50"
                >
                  <Icons.Clock /> Clock In
                </button>
                <button
                  type="button"
                  disabled={submitting || !own || Boolean(own.clockOut)}
                  onClick={() => void submitClock("clock-out")}
                  className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-100 disabled:opacity-50"
                >
                  <Icons.LogOut /> Clock Out
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-2">
                Mode kantor memerlukan izin lokasi. Geofence mengikuti lokasi
                kerja yang ditetapkan HR.
              </p>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-700 mb-2">
                Absensi Hari Ini ({records.length})
              </h4>
              {loading ? (
                <p className="text-xs text-slate-400 bg-slate-50 border border-dashed rounded-xl p-4 text-center">
                  Memuat data absensi...
                </p>
              ) : records.length === 0 ? (
                <p className="text-xs text-slate-400 bg-slate-50 border border-dashed rounded-xl p-4 text-center">
                  Belum ada absensi hari ini.
                </p>
              ) : (
                <ul className="space-y-2">
                  {records.map((record) => (
                    <li
                      key={record.id}
                      className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2"
                    >
                      <div>
                        <p className="font-semibold text-slate-800">
                          {record.employeeName}
                        </p>
                        <p className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Icons.MapPin /> {record.location} · {record.workMode ?? "OFFICE"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-semibold text-slate-700">
                          {formatTime(record.clockIn)} — {formatTime(record.clockOut)}
                        </p>
                        <p
                          className={`text-[11px] font-semibold ${
                            record.status === "Late"
                              ? "text-amber-600"
                              : "text-emerald-600"
                          }`}
                        >
                          {record.status}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {tab === "corrections" && (
          <div className="space-y-4">
            {user?.employeeId && (
              <form
                onSubmit={submitCorrection}
                className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-xs"
              >
                <p className="font-bold text-slate-700">Ajukan Koreksi</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input name="date" type="date" required className="p-2.5 border rounded-xl bg-white" />
                  <input name="requestedClockIn" type="datetime-local" className="p-2.5 border rounded-xl bg-white" />
                  <input name="requestedClockOut" type="datetime-local" className="p-2.5 border rounded-xl bg-white" />
                </div>
                <textarea
                  name="reason"
                  required
                  maxLength={500}
                  rows={2}
                  placeholder="Alasan koreksi (mis. lupa clock out)"
                  className="w-full p-2.5 border rounded-xl bg-white"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl font-semibold disabled:opacity-60"
                >
                  Kirim Koreksi
                </button>
              </form>
            )}

            <div>
              <h4 className="text-xs font-bold text-slate-700 mb-2">
                Daftar Koreksi ({corrections.length})
              </h4>
              {corrections.length === 0 ? (
                <p className="text-xs text-slate-400 bg-slate-50 border border-dashed rounded-xl p-4 text-center">
                  Belum ada pengajuan koreksi.
                </p>
              ) : (
                <ul className="space-y-2">
                  {corrections.map((correction) => (
                    <li
                      key={correction.id}
                      className="text-xs bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-800">
                            {correction.employeeName} · {correction.date.slice(0, 10)}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Masuk: {formatTime(correction.requestedClockIn)} · Keluar:{" "}
                            {formatTime(correction.requestedClockOut)}
                          </p>
                          <p className="text-[11px] text-slate-400">{correction.reason}</p>
                        </div>
                        <span
                          className={`shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${CORRECTION_STYLE[correction.status]}`}
                        >
                          {correction.status}
                        </span>
                      </div>
                      {correction.status === "PENDING" &&
                        canReview &&
                        correction.employeeId !== user?.employeeId && (
                          <div className="flex gap-2 mt-2">
                            <button
                              type="button"
                              onClick={() => void decideCorrection(correction.id, "APPROVED")}
                              className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-semibold"
                            >
                              Setujui
                            </button>
                            <button
                              type="button"
                              onClick={() => void decideCorrection(correction.id, "REJECTED")}
                              className="px-3 py-1.5 bg-rose-600 text-white rounded-lg font-semibold"
                            >
                              Tolak
                            </button>
                          </div>
                        )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {tab === "summary" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className="p-2.5 border rounded-xl text-xs"
              />
              {isHr && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      void apiDownload(
                        `/api/v1/attendance/export?month=${month}&format=csv`,
                        `absensi-${month}.csv`,
                      )
                    }
                    className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void apiDownload(
                        `/api/v1/attendance/export?month=${month}&format=xlsx`,
                        `absensi-${month}.xlsx`,
                      )
                    }
                    className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Export XLSX
                  </button>
                </>
              )}
            </div>

            <div className="border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2">Karyawan</th>
                    <th className="px-3 py-2">Hari Kerja</th>
                    <th className="px-3 py-2">Hadir</th>
                    <th className="px-3 py-2">Terlambat</th>
                    <th className="px-3 py-2">Cuti</th>
                    <th className="px-3 py-2">Alpha</th>
                    <th className="px-3 py-2">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-4 text-center text-slate-400">
                        Belum ada data rekap.
                      </td>
                    </tr>
                  ) : (
                    summary.map((row) => (
                      <tr key={row.employeeId}>
                        <td className="px-3 py-1.5">
                          <p className="font-semibold text-slate-800">{row.employeeName}</p>
                          <p className="text-slate-400">{row.department}</p>
                        </td>
                        <td className="px-3 py-1.5">{row.workingDays}</td>
                        <td className="px-3 py-1.5 text-emerald-600">{row.present}</td>
                        <td className="px-3 py-1.5 text-amber-600">{row.late}</td>
                        <td className="px-3 py-1.5 text-sky-600">{row.onLeave}</td>
                        <td className="px-3 py-1.5 text-rose-600">{row.absent}</td>
                        <td className="px-3 py-1.5 font-semibold">{row.attendanceRate}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
