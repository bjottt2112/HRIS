"use client";

import React, { useEffect, useState } from "react";
import { Icons } from "./Icons";
import { apiFetch } from "../lib/api";
import type {
  Employee,
  EmployeeFormValues,
  SettingsBootstrap,
} from "../lib/types";

interface EmployeeFormModalProps {
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: EmployeeFormValues) => Promise<void>;
  initial?: Employee | null;
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export default function EmployeeFormModal({
  submitting,
  onClose,
  onSubmit,
  initial,
}: EmployeeFormModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsBootstrap | null>(null);
  const [managers, setManagers] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const isEdit = Boolean(initial);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const [bootstrap, employees] = await Promise.all([
            apiFetch<SettingsBootstrap>("/api/v1/settings/bootstrap"),
            apiFetch<Employee[]>("/api/v1/employees"),
          ]);
          setSettings(bootstrap);
          setManagers(employees.map((employee) => ({ id: employee.id, name: employee.name })));
        } catch {
          // Form tetap bisa dipakai tanpa opsi jadwal/lokasi.
        }
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const text = (key: string) => String(formData.get(key) ?? "").trim();

    const values: EmployeeFormValues = {
      name: text("name"),
      email: text("email"),
      nik: text("nik"),
      department: text("department"),
      role: text("role"),
      employment: text("employment"),
      location: text("location"),
      joinDate: text("joinDate"),
      status: text("status") || "Active",
      phone: text("phone"),
      address: text("address"),
      emergencyName: text("emergencyName"),
      emergencyPhone: text("emergencyPhone"),
      npwp: text("npwp"),
      bpjs: text("bpjs"),
      bankAccount: text("bankAccount"),
      scheduleId: text("scheduleId"),
      workLocationId: text("workLocationId"),
      managerId: text("managerId"),
      effectiveDate: text("effectiveDate"),
      changeReason: text("changeReason"),
    };

    if (!values.name || !values.email || !values.nik) {
      setError("Nama, email, dan NIK wajib diisi.");
      return;
    }

    try {
      await onSubmit(values);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Gagal menyimpan karyawan.",
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-modal">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b pb-4 mb-4">
          <h3 className="text-lg font-bold text-slate-900">
            {isEdit ? "Ubah Data Karyawan" : "Tambah Karyawan Baru"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Tutup"
          >
            <Icons.X />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Nama Lengkap *
            </label>
            <input
              name="name"
              required
              defaultValue={initial?.name ?? ""}
              placeholder="mis. Alexander Wright"
              className="w-full p-2.5 border rounded-xl"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Email Perusahaan *
              </label>
              <input
                name="email"
                type="email"
                required
                defaultValue={initial?.email ?? ""}
                placeholder="alex@montreux.co"
                className="w-full p-2.5 border rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                NIK (16 Digit) *
              </label>
              <input
                name="nik"
                required
                defaultValue={initial?.nik ?? ""}
                placeholder="317109XXXXXXXXXX"
                className="w-full p-2.5 border rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Departemen
              </label>
              <select
                name="department"
                defaultValue={initial?.department ?? "Product"}
                className="w-full p-2.5 border rounded-xl"
              >
                <option value="Product">Product</option>
                <option value="Engineering">Engineering</option>
                <option value="Marketing">Marketing</option>
                <option value="Finance">Finance</option>
                <option value="People">People</option>
                <option value="General">General</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Jabatan / Role
              </label>
              <input
                name="role"
                required
                defaultValue={initial?.role ?? ""}
                placeholder="mis. Lead UX Researcher"
                className="w-full p-2.5 border rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Status Kepegawaian
              </label>
              <select
                name="employment"
                defaultValue={initial?.employment ?? "Full-time"}
                className="w-full p-2.5 border rounded-xl"
              >
                <option value="Full-time">Full-time</option>
                <option value="Contract">Contract</option>
                <option value="Internship">Internship</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Status Karyawan
              </label>
              <select
                name="status"
                defaultValue={initial?.status ?? "Active"}
                className="w-full p-2.5 border rounded-xl"
              >
                <option value="Active">Active</option>
                <option value="On Leave">On Leave</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Lokasi Kerja
              </label>
              <input
                name="location"
                defaultValue={initial?.location ?? "Jakarta, ID"}
                className="w-full p-2.5 border rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tanggal Masuk
              </label>
              <input
                name="joinDate"
                type="date"
                defaultValue={toDateInput(initial?.join_date)}
                className="w-full p-2.5 border rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Jadwal Kerja
              </label>
              <select
                name="scheduleId"
                defaultValue={initial?.schedule_id ?? ""}
                className="w-full p-2.5 border rounded-xl"
              >
                <option value="">Ikuti default</option>
                {settings?.schedules.map((schedule) => (
                  <option key={schedule.id} value={schedule.id}>
                    {schedule.name} ({schedule.start_time}–{schedule.end_time})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Lokasi Absensi (Geofence)
              </label>
              <select
                name="workLocationId"
                defaultValue={initial?.work_location_id ?? ""}
                className="w-full p-2.5 border rounded-xl"
              >
                <option value="">Tanpa geofence</option>
                {settings?.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name} ({location.radius_meters} m)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Atasan Langsung
            </label>
            <select
              name="managerId"
              defaultValue={initial?.manager_id ?? ""}
              className="w-full p-2.5 border rounded-xl"
            >
              <option value="">Tidak ada</option>
              {managers
                .filter((manager) => manager.id !== initial?.id)
                .map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name}
                  </option>
                ))}
            </select>
          </div>

          {isEdit && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tanggal Efektif Perubahan
                </label>
                <input
                  name="effectiveDate"
                  type="date"
                  className="w-full p-2.5 border rounded-xl bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Alasan Perubahan
                </label>
                <input
                  name="changeReason"
                  placeholder="mis. Promosi / rotasi"
                  className="w-full p-2.5 border rounded-xl bg-white"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                No. Telepon
              </label>
              <input
                name="phone"
                defaultValue={initial?.phone ?? ""}
                placeholder="0812xxxxxxx"
                className="w-full p-2.5 border rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Alamat
              </label>
              <input
                name="address"
                defaultValue={initial?.address ?? ""}
                placeholder="Jl. ..."
                className="w-full p-2.5 border rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Kontak Darurat
              </label>
              <input
                name="emergencyName"
                defaultValue={initial?.emergency_name ?? ""}
                placeholder="Nama keluarga"
                className="w-full p-2.5 border rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                No. Kontak Darurat
              </label>
              <input
                name="emergencyPhone"
                defaultValue={initial?.emergency_phone ?? ""}
                placeholder="0813xxxxxxx"
                className="w-full p-2.5 border rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                NPWP
              </label>
              <input
                name="npwp"
                defaultValue={initial?.npwp ?? ""}
                placeholder="09.254.294.1-403.000"
                className="w-full p-2.5 border rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                BPJS
              </label>
              <input
                name="bpjs"
                defaultValue={initial?.bpjs ?? ""}
                placeholder="0001234567890"
                className="w-full p-2.5 border rounded-xl"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Rekening Bank
            </label>
            <input
              name="bankAccount"
              defaultValue={initial?.bank_account ?? ""}
              placeholder="BCA 1234567890"
              className="w-full p-2.5 border rounded-xl"
            />
          </div>

          {error && (
            <p className="text-rose-600 font-medium bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <div className="pt-4 flex justify-end gap-2 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-xl"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-brand-accent text-white font-semibold rounded-xl hover:bg-rose-600 disabled:opacity-60"
            >
              {submitting
                ? "Menyimpan..."
                : isEdit
                  ? "Simpan Perubahan"
                  : "Simpan ke DB"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
