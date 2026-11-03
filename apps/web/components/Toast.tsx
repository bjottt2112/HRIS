"use client";

import React from "react";
import type { ToastMessage } from "../lib/types";

interface ToastProps {
  toast: ToastMessage | null;
}

export default function Toast({ toast }: ToastProps) {
  if (!toast) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[60] bg-slate-900 text-white px-4 py-3 rounded-2xl flex items-center gap-3 text-xs border border-slate-700 shadow-xl">
      <span
        className={`w-2.5 h-2.5 rounded-full ${
          toast.type === "error" ? "bg-rose-500" : "bg-emerald-400"
        }`}
      />
      <span className="font-medium">{toast.message}</span>
    </div>
  );
}
