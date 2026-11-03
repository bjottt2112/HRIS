"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Icons } from "./Icons";
import { apiDownload, apiFetch, apiUpload } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import type {
  LeaveBalance,
  LeaveCalendarItem,
  LeaveRequest,
  LeaveType,
} from "../lib/types";

interface LeaveModalProps {
  onClose: () => void;
  onChanged?: () => void;
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-rose-50 text-rose-700 border-rose-200",
  CANCELLED: "bg-slate-100 text-slate-500 border-slate-200",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function LeaveModal({ onClose, onChanged }: LeaveModalProps) {
  const { user } = useAuth();
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [calendar, setCalendar] = useState<LeaveCalendarItem[]>([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isHr = user?.role === "SUPER_ADMIN" || user?.role === "HR_ADMIN";
  const canReview = isHr || user?.role === "MANAGER";
  const hasEmployee = Boolean(user?.employeeId);

  const load = useCallback(async () => {
    try {
      const [typeData, requestData, calendarData] = await Promise.all([
        apiFetch<LeaveType[]>("/api/v1/leave/types"),
        apiFetch<LeaveRequest[]>("/api/v1/leave/requests"),
        apiFetch<{ month: string; days: LeaveCalendarItem[] }>(
          `/api/v1/leave/calendar?month=${month}`,
        ),
      ]);
      setTypes(typeData);
      setRequests(requestData);
      setCalendar(calendarData.days);

      if (hasEmployee) {
        const balanceData = await apiFetch<LeaveBalance[]>(
          "/api/v1/leave/balances/me",
        );
        setBalances(balanceData);
      } else {
        // Akun tanpa data karyawan (mis. admin) tetap bisa mereview pengajuan.
        setBalances([]);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Gagal memuat data cuti.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasEmployee, month]);

  useEffect(() => {
    // Muat data setelah commit pertama agar tidak memicu cascading render.
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const text = (key: string) => String(formData.get(key) ?? "").trim();

    const leaveTypeId = text("leaveTypeId");
    const startDate = text("startDate");
    const endDate = text("endDate");
    const reason = text("reason");

    if (!leaveTypeId || !startDate || !endDate || !reason) {
      setError("Semua field wajib diisi.");
      return;
    }

    const selectedType = types.find((type) => type.id === leaveTypeId);
    const attachment = formData.get("attachment");
    if (
      selectedType?.requires_attachment &&
      (!(attachment instanceof File) || attachment.size === 0)
    ) {
      setError(`${selectedType.name} memerlukan lampiran.`);
      return;
    }

    setSubmitting(true);

    try {
      const payload = new FormData();
      payload.append("leaveTypeId", leaveTypeId);
      payload.append("startDate", startDate);
      payload.append("endDate", endDate);
      payload.append("reason", reason);
      if (attachment instanceof File && attachment.size > 0) {
        payload.append("attachment", attachment);
      }

      await apiUpload("/api/v1/leave/requests", payload);
      form.reset();
      await load();
      onChanged?.();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Gagal mengirim pengajuan cuti.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const decide = async (id: string, status: "APPROVED" | "REJECTED") => {
    setError(null);
    try {
      await apiFetch(`/api/v1/leave/requests/${id}/decision`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
      onChanged?.();
    } catch (decisionError) {
      setError(
        decisionError instanceof Error
          ? decisionError.message
          : "Gagal memproses pengajuan.",
      );
    }
  };

  const cancel = async (id: string) => {
    setError(null);
    try {
      await apiFetch(`/api/v1/leave/requests/${id}/cancel`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      await load();
      onChanged?.();
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : "Gagal membatalkan pengajuan.",
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-modal">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b pb-4 mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Leave Request</h3>
            <p className="text-[11px] text-slate-400">
              Ajukan cuti dan pantau status persetujuannya.
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

        {balances.some((balance) => balance.entitled > 0) && (
          <div className="flex flex-wrap gap-2 mb-4">
            {balances
              .filter((balance) => balance.entitled > 0)
              .map((balance) => (
                <span
                  key={balance.id}
                  className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-semibold text-slate-600"
                >
                  {balance.leaveType.name}: {balance.remaining}/{balance.entitled + balance.carriedOver} hari
                  {balance.carriedOver > 0 && (
                    <span className="text-slate-400">
                      {" "}· carry-over {balance.carriedOver}
                      {balance.expiresAt
                        ? ` (exp. ${balance.expiresAt.slice(0, 10)})`
                        : ""}
                    </span>
                  )}
                </span>
              ))}
          </div>
        )}

        {error && (
          <p className="text-rose-600 font-medium bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 mb-3">
            {error}
          </p>
        )}

        {hasEmployee ? (
          <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Jenis Cuti
            </label>
            <select
              name="leaveTypeId"
              required
              className="w-full p-2.5 border rounded-xl"
              defaultValue=""
            >
              <option value="" disabled>
                Pilih jenis cuti
              </option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tanggal Mulai
              </label>
              <input
                name="startDate"
                type="date"
                required
                className="w-full p-2.5 border rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tanggal Selesai
              </label>
              <input
                name="endDate"
                type="date"
                required
                className="w-full p-2.5 border rounded-xl"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Alasan
            </label>
            <textarea
              name="reason"
              required
              maxLength={500}
              rows={2}
              className="w-full p-2.5 border rounded-xl"
              placeholder="Jelaskan alasan pengajuan cuti"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Lampiran (PDF/JPG/PNG/WEBP, maks. 5 MB)
            </label>
            <input
              name="attachment"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              className="w-full p-2 border rounded-xl bg-white"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Wajib untuk jenis cuti yang ditandai perlu lampiran (mis. surat
              dokter).
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-2.5 bg-brand-accent text-white font-semibold rounded-xl hover:bg-rose-600 disabled:opacity-60"
          >
            {submitting ? "Mengirim..." : "Kirim Pengajuan"}
          </button>
        </form>
        ) : (
          <p className="text-xs text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-xl px-3 py-3">
            Akun ini tidak terhubung ke data karyawan, jadi tidak bisa
            mengajukan cuti. Kamu tetap dapat memproses pengajuan tim di bawah.
          </p>
        )}

        <div className="mt-6">
          <h4 className="text-xs font-bold text-slate-700 mb-2">
            Pengajuan ({requests.length})
          </h4>
          {loading ? (
            <p className="text-xs text-slate-400 bg-slate-50 border border-dashed rounded-xl p-4 text-center">
              Memuat pengajuan...
            </p>
          ) : requests.length === 0 ? (
            <p className="text-xs text-slate-400 bg-slate-50 border border-dashed rounded-xl p-4 text-center">
              Belum ada pengajuan cuti.
            </p>
          ) : (
            <ul className="space-y-2">
              {requests.map((request) => {
                const isOwn = request.employeeId === user?.employeeId;
                const mayDecide =
                  request.status === "PENDING" && canReview && !isOwn;

                return (
                  <li
                    key={request.id}
                    className="text-xs bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800">
                          {request.employeeName} · {request.leaveType.name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {formatDate(request.startDate)} —{" "}
                          {formatDate(request.endDate)} ({request.days} hari)
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {request.reason}
                        </p>
                        {request.reviewerNote && (
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Catatan reviewer: {request.reviewerNote}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          {request.status === "PENDING" && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              Tahap: {request.stage === "HR" ? "HR" : "Atasan"}
                            </span>
                          )}
                          {request.hasAttachment && (
                            <button
                              type="button"
                              onClick={() =>
                                void apiDownload(
                                  `/api/v1/leave/requests/${request.id}/attachment`,
                                  request.attachmentName ?? "lampiran",
                                )
                              }
                              className="text-[10px] font-semibold text-rose-600 hover:text-rose-700 underline"
                            >
                              Unduh lampiran
                            </button>
                          )}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_STYLE[request.status] ?? STATUS_STYLE.CANCELLED}`}
                      >
                        {request.status}
                      </span>
                    </div>

                    {(mayDecide || (isOwn && request.status === "PENDING")) && (
                      <div className="flex gap-2 mt-2">
                        {mayDecide && (
                          <>
                            <button
                              type="button"
                              onClick={() => void decide(request.id, "APPROVED")}
                              className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700"
                            >
                              Setujui
                            </button>
                            <button
                              type="button"
                              onClick={() => void decide(request.id, "REJECTED")}
                              className="px-3 py-1.5 bg-rose-600 text-white rounded-lg font-semibold hover:bg-rose-700"
                            >
                              Tolak
                            </button>
                          </>
                        )}
                        {isOwn && (
                          <button
                            type="button"
                            onClick={() => void cancel(request.id)}
                            className="px-3 py-1.5 border border-slate-200 bg-white text-slate-600 rounded-lg font-semibold hover:bg-slate-100"
                          >
                            Batalkan
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-6 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h4 className="text-xs font-bold text-slate-700">
              Kalender Tim ({calendar.length})
            </h4>
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="p-2 border rounded-xl text-xs"
            />
          </div>
          {calendar.length === 0 ? (
            <p className="text-xs text-slate-400 bg-slate-50 border border-dashed rounded-xl p-4 text-center">
              Tidak ada cuti pada bulan ini.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {calendar.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2 text-[11px]"
                >
                  <div>
                    <p className="font-semibold text-slate-800">
                      {item.employeeName} · {item.leaveType}
                    </p>
                    <p className="text-slate-500">
                      {formatDate(item.startDate)} — {formatDate(item.endDate)} ·{" "}
                      {item.department}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      item.status === "APPROVED"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}
                  >
                    {item.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
