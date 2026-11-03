"use client";

import React, { useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../lib/api";

type ForgotResponse = {
  ok: boolean;
  message: string;
  devResetLink?: string;
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setDevLink(null);
    setSubmitting(true);

    try {
      const data = await apiFetch<ForgotResponse>("/api/v1/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setMessage(data.message);
      setDevLink(data.devResetLink ?? null);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Gagal memproses permintaan reset password.",
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
          <h1 className="text-xl font-bold text-slate-900">Lupa password?</h1>
          <p className="text-xs text-slate-500 mt-1 mb-6">
            Masukkan email akun Anda. Kami akan mengirim tautan reset yang
            berlaku 60 menit.
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

            {error && (
              <p className="text-rose-600 font-medium bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            {message && (
              <div className="text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 space-y-2">
                <p>{message}</p>
                {devLink && (
                  <p className="break-all text-[11px]">
                    Mode pengembangan (SMTP belum aktif):{" "}
                    <a href={devLink} className="underline font-semibold">
                      buka tautan reset
                    </a>
                  </p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-brand-accent text-white font-bold rounded-xl hover:bg-rose-600 disabled:opacity-60 transition"
            >
              {submitting ? "Mengirim..." : "Kirim tautan reset"}
            </button>
          </form>

          <p className="text-xs text-slate-500 mt-4 text-center">
            Ingat password Anda?{" "}
            <Link
              href="/login"
              className="font-semibold text-rose-600 hover:text-rose-700"
            >
              Kembali ke login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
