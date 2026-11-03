"use client";

import React, { useMemo } from "react";
import { Icons } from "./Icons";
import type { EmployeeRow } from "../lib/types";

interface OrgChartProps {
  employees: EmployeeRow[];
  loading: boolean;
  onViewEmployee: (employee: EmployeeRow) => void;
}

export default function OrgChart({
  employees,
  loading,
  onViewEmployee,
}: OrgChartProps) {
  const { roots, childrenByManager } = useMemo(() => {
    const ids = new Set(employees.map((employee) => employee.id));
    const map = new Map<string, EmployeeRow[]>();

    for (const employee of employees) {
      const managerId =
        employee.manager_id && ids.has(employee.manager_id)
          ? employee.manager_id
          : null;

      if (!managerId) continue;
      const bucket = map.get(managerId) ?? [];
      bucket.push(employee);
      map.set(managerId, bucket);
    }

    for (const bucket of map.values()) {
      bucket.sort((first, second) => first.name.localeCompare(second.name));
    }

    const rootList = employees
      .filter(
        (employee) =>
          !employee.manager_id || !ids.has(employee.manager_id),
      )
      .sort((first, second) => first.name.localeCompare(second.name));

    // Lindungi dari data siklik: jika tidak ada root, tampilkan semua
    // karyawan sebagai root agar chart tetap bisa dirender.
    return {
      roots: rootList.length > 0 ? rootList : [...employees],
      childrenByManager: map,
    };
  }, [employees]);

  const rendered = new Set<string>();

  const renderNode = (employee: EmployeeRow, depth: number) => {
    if (rendered.has(employee.id)) return null;
    rendered.add(employee.id);

    const children = childrenByManager.get(employee.id) ?? [];

    return (
      <li key={employee.id} className="relative">
        <button
          type="button"
          onClick={() => onViewEmployee(employee)}
          className="group w-full sm:w-auto text-left bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-3 sm:p-4 hover:border-rose-300 hover:shadow-sm transition"
        >
          <span className="flex items-center gap-3">
            <span
              className={`w-9 h-9 rounded-full ${employee.avatarBg} font-bold text-xs flex items-center justify-center shrink-0`}
            >
              {employee.initials}
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-bold text-slate-900 truncate group-hover:text-rose-600 transition">
                {employee.name}
              </span>
              <span className="block text-[11px] text-slate-500 truncate">
                {employee.role}
              </span>
              <span className="block text-[10px] text-slate-400 truncate">
                {employee.department} · {employee.location}
              </span>
            </span>
          </span>
        </button>

        {children.length > 0 && (
          <ul className="mt-2 ml-4 sm:ml-6 pl-4 border-l border-dashed border-slate-200 space-y-2">
            {children.map((child) => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-slate-400 font-medium mb-1">
          People /{" "}
          <span className="text-slate-700 font-semibold">Organization</span>
        </p>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Organization Chart
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Struktur atasan langsung dan anggota tim. Klik kartu untuk membuka
          detail karyawan.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4 sm:p-6">
        {loading ? (
          <p className="py-10 text-center text-xs text-slate-400">
            Memuat struktur organisasi...
          </p>
        ) : roots.length === 0 ? (
          <div className="py-10 text-center text-slate-400">
            <span className="inline-flex w-10 h-10 items-center justify-center rounded-xl bg-slate-50 mb-3">
              <Icons.Building />
            </span>
            <p className="text-xs">Belum ada data karyawan untuk ditampilkan.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {roots.map((employee) => renderNode(employee, 0))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-slate-400">
        Hierarki dibangun dari field <span className="font-semibold">atasan
        langsung</span> pada profil karyawan. Data yang tampil mengikuti cakupan
        peran Anda.
      </p>
    </div>
  );
}
