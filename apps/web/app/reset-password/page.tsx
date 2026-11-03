"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "../../lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError("Tautan reset tidak memuat token. Minta tautan baru.");
      return;
    }

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
      await apiFetch("/api/v1/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setSuccess(true);
      window.setTimeout(() => router.replace("/login"), 2500);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Gagal memperbarui password.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xl p-6 sm:p-8">
      <h1 className="text-xl font-bold text-slate-900">Atur password baru</h1>
      <p className="text-xs text-slate-500 mt-1 mb-6">
        Gunakan minimal 8 karakter. Setelah berhasil, semua sesi lain akan
        diakhiri.
      </p>

      {success ? (
        <div className="text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-3 text-xs">
          Password berhasil diperbarui. Anda akan diarahkan ke halaman login...
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Password Baru
            </label>
            <input
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Ulangi Password Baru
            </label>
            <input
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="••••••••"
              className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
            />
          </div>

          {!token && (
            <p className="text-amber-700 font-medium bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              Token tidak ditemukan pada URL. Silakan minta tautan reset baru.
            </p>
          )}

          {error && (
            <p className="text-rose-600 font-medium bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !token}
            className="w-full py-3 bg-brand-accent text-white font-bold rounded-xl hover:bg-rose-600 disabled:opacity-60 transition"
          >
            {submitting ? "Menyimpan..." : "Simpan password baru"}
          </button>
        </form>
      )}

      <p className="text-xs text-slate-500 mt-4 text-center">
        <Link
          href="/forgot-password"
          className="font-semibold text-rose-600 hover:text-rose-700"
        >
          Minta tautan reset baru
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-4">
      <div className="w-full max-w-md">
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

        <Suspense
          fallback={
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xl p-6 text-xs text-slate-400">
              Memuat...
            </div>
          }
        >
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
