"use client";

import React, { useMemo, useState } from "react";
import { Icons } from "./Icons";
import type { EmployeeRow } from "../lib/types";

interface CommandPaletteProps {
  employees: EmployeeRow[];
  onSelectEmployee: (employee: EmployeeRow) => void;
  onNavigate: (tab: string) => void;
  onClose: () => void;
}

export default function CommandPalette({
  employees,
  onSelectEmployee,
  onNavigate,
  onClose,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");

  const filteredEmployees = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return employees.slice(0, 5);

    return employees
      .filter(
        (employee) =>
          employee.name.toLowerCase().includes(keyword) ||
          employee.email.toLowerCase().includes(keyword) ||
          employee.department.toLowerCase().includes(keyword),
      )
      .slice(0, 6);
  }, [employees, query]);

  const quickLinks = [
    { label: "Dashboard", tab: "Dashboard" },
    { label: "Employees", tab: "Employees" },
  ].filter((link) => link.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-24 bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 border-b border-slate-100">
          <span className="text-slate-400">
            <Icons.Search />
          </span>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari karyawan, departemen, atau halaman..."
            className="flex-1 py-3.5 text-xs outline-none"
          />
          <kbd className="text-[10px] font-semibold text-slate-400 bg-slate-50 border border-slate-200 rounded-md px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {quickLinks.length > 0 && (
            <div className="mb-1">
              <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Navigasi
              </p>
              {quickLinks.map((link) => (
                <button
                  key={link.tab}
                  type="button"
                  onClick={() => {
                    onNavigate(link.tab);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Icons.Dashboard /> {link.label}
                </button>
              ))}
            </div>
          )}

          <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Karyawan
          </p>
          {filteredEmployees.length === 0 ? (
            <p className="px-2 py-4 text-xs text-slate-400 text-center">
              Tidak ada hasil untuk &quot;{query}&quot;.
            </p>
          ) : (
            filteredEmployees.map((employee) => (
              <button
                key={employee.id}
                type="button"
                onClick={() => {
                  onSelectEmployee(employee);
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left hover:bg-slate-50"
              >
                <span
                  className={`w-7 h-7 rounded-full ${employee.avatarBg} text-[10px] font-bold flex items-center justify-center`}
                >
                  {employee.initials}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-slate-800 truncate">
                    {employee.name}
                  </span>
                  <span className="block text-[11px] text-slate-400 truncate">
                    {employee.role} • {employee.department}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
