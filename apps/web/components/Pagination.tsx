"use client";

import React from "react";
import { Icons } from "./Icons";

interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({
  page,
  totalPages,
  totalItems,
  onPageChange,
}: PaginationProps) {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-slate-100 text-xs text-slate-500">
      <span className="font-medium">
        Menampilkan halaman {page} dari {totalPages} • {totalItems} karyawan
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="inline-flex rotate-90">
            <Icons.ChevronDown />
          </span>{" "}
          Prev
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next{" "}
          <span className="inline-flex -rotate-90">
            <Icons.ChevronDown />
          </span>
        </button>
      </div>
    </div>
  );
}
