"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    setSubmitting(true);

    try {
      await login(email.trim(), password);
      router.replace("/");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Gagal login. Coba lagi.",
      );
    } finally {
      setSubmitting(false);
    }
  };

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

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xl p-6 sm:p-8">
          <h1 className="text-xl font-bold text-slate-900">Masuk ke akun Anda</h1>
          <p className="text-xs text-slate-500 mt-1 mb-6">
            Gunakan email dan password yang terdaftar.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nama@email.com"
                className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-semibold text-slate-700">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="font-semibold text-rose-600 hover:text-rose-700"
                >
                  Lupa password?
                </Link>
              </div>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
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
              {submitting ? "Memproses..." : "Masuk"}
            </button>
          </form>

          <p className="text-xs text-slate-500 mt-4 text-center">
            Belum punya akun?{" "}
            <Link
              href="/register"
              className="font-semibold text-rose-600 hover:text-rose-700"
            >
              Buat akun
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
