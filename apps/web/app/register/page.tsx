"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading, register } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const text = (key: string) => String(formData.get(key) ?? "").trim();

    const password = text("password");
    const confirmPassword = text("confirmPassword");

    if (password !== confirmPassword) {
      setError("Konfirmasi password tidak sama.");
      return;
    }

    if (password.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }

    setSubmitting(true);

    try {
      await register({
        name: text("name"),
        email: text("email"),
        password,
        nik: text("nik"),
        department: text("department"),
        jobTitle: text("jobTitle"),
      });
      router.replace("/");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Gagal membuat akun. Coba lagi.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-4 py-10">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-brand-accent flex items-center justify-center text-white font-extrabold text-xl shadow-lg shadow-rose-200">
            M
          </div>
          <div>
            <p className="font-extrabold text-2xl text-slate-900 tracking-tight leading-none">
              Montreux
            </p>
            <p className="text-[10px] text-slate-400 font-semibold tracking-wider">
              HRIS PLATFORM
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xl p-6 sm:p-8">
          <h1 className="text-xl font-bold text-slate-900">Buat akun baru</h1>
          <p className="text-xs text-slate-500 mt-1 mb-6">
            Akun karyawan akan otomatis terhubung ke Employee Directory.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Nama Lengkap *
              </label>
              <input
                name="name"
                required
                placeholder="mis. Alexander Wright"
                className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Email *
                </label>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="nama@email.com"
                  className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  NIK (16 Digit) *
                </label>
                <input
                  name="nik"
                  required
                  placeholder="317109XXXXXXXXXX"
                  className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
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
                  defaultValue="General"
                  className="w-full p-3 border border-slate-200 rounded-xl"
                >
                  <option value="General">General</option>
                  <option value="Product">Product</option>
                  <option value="Engineering">Engineering</option>
                  <option value="Marketing">Marketing</option>
                  <option value="Finance">Finance</option>
                  <option value="People">People</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Jabatan
                </label>
                <input
                  name="jobTitle"
                  defaultValue="Staff"
                  className="w-full p-3 border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Password *
                </label>
                <input
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Minimal 8 karakter"
                  className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Konfirmasi Password *
                </label>
                <input
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Ulangi password"
                  className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
              </div>
            </div>

            {error && (
              <p className="text-rose-600 font-medium bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-brand-accent text-white font-bold rounded-xl hover:bg-rose-600 disabled:opacity-60 transition"
            >
              {submitting ? "Membuat akun..." : "Buat Akun"}
            </button>
          </form>

          <p className="text-xs text-slate-500 mt-4 text-center">
            Sudah punya akun?{" "}
            <Link
              href="/login"
              className="font-semibold text-rose-600 hover:text-rose-700"
            >
              Masuk
            </Link>
          </p>

          <p className="text-[11px] text-slate-400 mt-4 text-center">
            Akun baru selalu mendapat role EMPLOYEE. Hubungi HR untuk perubahan
            role.
          </p>
        </div>
      </div>
    </div>
  );
}
