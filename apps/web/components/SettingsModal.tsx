"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Icons } from "./Icons";
import { apiFetch } from "../lib/api";
import type {
  Holiday,
  LeaveType,
  SettingsBootstrap,
  WorkLocation,
  WorkSchedule,
} from "../lib/types";

interface SettingsModalProps {
  onClose: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

type Tab = "schedules" | "locations" | "holidays" | "leaveTypes";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "schedules", label: "Jadwal Kerja" },
  { key: "locations", label: "Lokasi & Geofence" },
  { key: "holidays", label: "Hari Libur" },
  { key: "leaveTypes", label: "Jenis Cuti" },
];

export default function SettingsModal({
  onClose,
  onError,
  onSuccess,
}: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>("schedules");
  const [data, setData] = useState<SettingsBootstrap | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const bootstrap = await apiFetch<SettingsBootstrap>(
        "/api/v1/settings/bootstrap",
      );
      setData(bootstrap);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Gagal memuat pengaturan.");
    }
  }, [onError]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const run = async (
    action: () => Promise<unknown>,
    successMessage: string,
  ) => {
    setBusy(true);
    try {
      await action();
      await load();
      onSuccess(successMessage);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Aksi gagal.");
    } finally {
      setBusy(false);
    }
  };

  const createSchedule = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name") ?? "").trim(),
      startTime: String(formData.get("startTime") ?? ""),
      endTime: String(formData.get("endTime") ?? ""),
      lateToleranceMinutes: Number(formData.get("lateToleranceMinutes") ?? 0),
      workDays: String(formData.get("workDays") ?? "1,2,3,4,5"),
    };

    void run(async () => {
      await apiFetch("/api/v1/settings/schedules", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      form.reset();
    }, "Jadwal kerja ditambahkan.");
  };

  const createLocation = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name") ?? "").trim(),
      latitude: Number(formData.get("latitude")),
      longitude: Number(formData.get("longitude")),
      radiusMeters: Number(formData.get("radiusMeters")),
      allowWfh: formData.get("allowWfh") === "on",
    };

    void run(async () => {
      await apiFetch("/api/v1/settings/locations", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      form.reset();
    }, "Lokasi kerja ditambahkan.");
  };

  const createHoliday = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      date: String(formData.get("date") ?? ""),
      name: String(formData.get("name") ?? "").trim(),
      type: String(formData.get("type") ?? "NATIONAL"),
    };

    void run(async () => {
      await apiFetch("/api/v1/settings/holidays", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      form.reset();
    }, "Hari libur ditambahkan.");
  };

  const createLeaveType = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      code: String(formData.get("code") ?? "").trim().toUpperCase(),
      name: String(formData.get("name") ?? "").trim(),
      defaultQuota: Number(formData.get("defaultQuota") ?? 0),
      carryOverMax: Number(formData.get("carryOverMax") ?? 0),
      minServiceMonths: Number(formData.get("minServiceMonths") ?? 0),
      requiresAttachment: formData.get("requiresAttachment") === "on",
      requiresHrApproval: formData.get("requiresHrApproval") === "on",
    };

    void run(async () => {
      await apiFetch("/api/v1/settings/leave-types", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      form.reset();
    }, "Jenis cuti ditambahkan.");
  };

  const remove = (path: string, label: string) => {
    if (!window.confirm(`Hapus ${label}?`)) return;
    void run(
      () => apiFetch(path, { method: "DELETE" }),
      `${label} dihapus.`,
    );
  };

  const toggleLeaveType = (type: LeaveType, field: "requires_attachment" | "requires_hr_approval") => {
    void run(
      () =>
        apiFetch(`/api/v1/settings/leave-types/${type.id}`, {
          method: "PATCH",
          body: JSON.stringify({ [field === "requires_attachment" ? "requiresAttachment" : "requiresHrApproval"]: !type[field] }),
        }),
      "Kebijakan cuti diperbarui.",
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-modal">
      <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between border-b pb-4 mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Pengaturan HR</h3>
            <p className="text-[11px] text-slate-400">
              Jadwal kerja, geofence lokasi, hari libur, dan kebijakan cuti.
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

        <div className="flex flex-wrap gap-2 mb-4">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                tab === item.key
                  ? "bg-rose-50 border-rose-200 text-rose-700"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {!data ? (
          <p className="text-xs text-slate-400 p-4">Memuat pengaturan...</p>
        ) : tab === "schedules" ? (
          <div className="space-y-4 text-xs">
            <ul className="space-y-2">
              {data.schedules.map((schedule: WorkSchedule) => (
                <li
                  key={schedule.id}
                  className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                >
                  <div>
                    <p className="font-semibold text-slate-800">{schedule.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {schedule.start_time}–{schedule.end_time} · toleransi{" "}
                      {schedule.late_tolerance_minutes} menit · hari {schedule.work_days}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(`/api/v1/settings/schedules/${schedule.id}`, `jadwal ${schedule.name}`)}
                    className="text-rose-600 font-semibold hover:underline disabled:opacity-50"
                  >
                    Hapus
                  </button>
                </li>
              ))}
            </ul>

            <form onSubmit={createSchedule} className="grid grid-cols-2 gap-2 border-t pt-4">
              <input name="name" required placeholder="Nama jadwal" className="p-2.5 border rounded-xl col-span-2" />
              <input name="startTime" required defaultValue="09:00" placeholder="Jam masuk" className="p-2.5 border rounded-xl" />
              <input name="endTime" required defaultValue="17:00" placeholder="Jam keluar" className="p-2.5 border rounded-xl" />
              <input name="lateToleranceMinutes" type="number" min={0} max={180} defaultValue={0} placeholder="Toleransi (menit)" className="p-2.5 border rounded-xl" />
              <input name="workDays" defaultValue="1,2,3,4,5" placeholder="Hari kerja (1=Senin)" className="p-2.5 border rounded-xl" />
              <button type="submit" disabled={busy} className="col-span-2 px-4 py-2 bg-slate-900 text-white rounded-xl font-semibold disabled:opacity-60">
                Tambah Jadwal
              </button>
            </form>
          </div>
        ) : tab === "locations" ? (
          <div className="space-y-4 text-xs">
            <ul className="space-y-2">
              {data.locations.map((location: WorkLocation) => (
                <li
                  key={location.id}
                  className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                >
                  <div>
                    <p className="font-semibold text-slate-800">{location.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {location.latitude}, {location.longitude} · radius{" "}
                      {location.radius_meters} m · WFH{" "}
                      {location.allow_wfh ? "diizinkan" : "tidak"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(`/api/v1/settings/locations/${location.id}`, `lokasi ${location.name}`)}
                    className="text-rose-600 font-semibold hover:underline disabled:opacity-50"
                  >
                    Hapus
                  </button>
                </li>
              ))}
            </ul>

            <form onSubmit={createLocation} className="grid grid-cols-2 gap-2 border-t pt-4">
              <input name="name" required placeholder="Nama lokasi" className="p-2.5 border rounded-xl col-span-2" />
              <input name="latitude" type="number" step="any" required placeholder="Latitude" className="p-2.5 border rounded-xl" />
              <input name="longitude" type="number" step="any" required placeholder="Longitude" className="p-2.5 border rounded-xl" />
              <input name="radiusMeters" type="number" min={10} max={10000} defaultValue={150} placeholder="Radius (meter)" className="p-2.5 border rounded-xl" />
              <label className="flex items-center gap-2 text-slate-600">
                <input name="allowWfh" type="checkbox" defaultChecked /> Izinkan WFH
              </label>
              <button type="submit" disabled={busy} className="col-span-2 px-4 py-2 bg-slate-900 text-white rounded-xl font-semibold disabled:opacity-60">
                Tambah Lokasi
              </button>
            </form>
          </div>
        ) : tab === "holidays" ? (
          <div className="space-y-4 text-xs">
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {data.holidays.map((holiday: Holiday) => (
                <li
                  key={holiday.id}
                  className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                >
                  <div>
                    <p className="font-semibold text-slate-800">{holiday.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {holiday.date.slice(0, 10)} · {holiday.type}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(`/api/v1/settings/holidays/${holiday.id}`, `hari libur ${holiday.name}`)}
                    className="text-rose-600 font-semibold hover:underline disabled:opacity-50"
                  >
                    Hapus
                  </button>
                </li>
              ))}
            </ul>

            <form onSubmit={createHoliday} className="grid grid-cols-2 gap-2 border-t pt-4">
              <input name="date" type="date" required className="p-2.5 border rounded-xl" />
              <input name="name" required placeholder="Nama hari libur" className="p-2.5 border rounded-xl" />
              <select name="type" className="p-2.5 border rounded-xl">
                <option value="NATIONAL">Nasional</option>
                <option value="COLLECTIVE">Cuti Bersama</option>
                <option value="COMPANY">Perusahaan</option>
              </select>
              <button type="submit" disabled={busy} className="px-4 py-2 bg-slate-900 text-white rounded-xl font-semibold disabled:opacity-60">
                Tambah Hari Libur
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            <ul className="space-y-2">
              {data.leaveTypes.map((type: LeaveType) => (
                <li
                  key={type.id}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-800">
                      {type.name} <span className="text-slate-400">({type.code})</span>
                    </p>
                    <span className="text-[11px] text-slate-500">
                      Kuota {type.default_quota} · carry-over {type.carry_over_max} ·
                      min {type.min_service_months} bln
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-1 text-[11px] text-slate-600">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={type.requires_attachment}
                        disabled={busy}
                        onChange={() => toggleLeaveType(type, "requires_attachment")}
                      />
                      Wajib lampiran
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={type.requires_hr_approval}
                        disabled={busy}
                        onChange={() => toggleLeaveType(type, "requires_hr_approval")}
                      />
                      Perlu persetujuan HR
                    </label>
                  </div>
                </li>
              ))}
            </ul>

            <form onSubmit={createLeaveType} className="grid grid-cols-2 gap-2 border-t pt-4">
              <input name="code" required placeholder="Kode (mis. ANNUAL)" className="p-2.5 border rounded-xl" />
              <input name="name" required placeholder="Nama jenis cuti" className="p-2.5 border rounded-xl" />
              <input name="defaultQuota" type="number" min={0} max={365} defaultValue={12} placeholder="Kuota" className="p-2.5 border rounded-xl" />
              <input name="carryOverMax" type="number" min={0} max={365} defaultValue={0} placeholder="Maks carry-over" className="p-2.5 border rounded-xl" />
              <input name="minServiceMonths" type="number" min={0} max={120} defaultValue={0} placeholder="Min masa kerja (bulan)" className="p-2.5 border rounded-xl" />
              <div className="flex flex-col gap-1 justify-center text-[11px]">
                <label className="flex items-center gap-1.5">
                  <input name="requiresAttachment" type="checkbox" /> Wajib lampiran
                </label>
                <label className="flex items-center gap-1.5">
                  <input name="requiresHrApproval" type="checkbox" /> Perlu persetujuan HR
                </label>
              </div>
              <button type="submit" disabled={busy} className="col-span-2 px-4 py-2 bg-slate-900 text-white rounded-xl font-semibold disabled:opacity-60">
                Tambah Jenis Cuti
              </button>
            </form>
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
