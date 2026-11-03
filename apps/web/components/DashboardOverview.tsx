"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Icons } from "./Icons";
import { apiFetch } from "../lib/api";
import type { AttendanceRecord, EmployeeRow, LeaveRequest } from "../lib/types";

interface DashboardOverviewProps {
  employees: EmployeeRow[];
  loading: boolean;
  onViewEmployee: (employee: EmployeeRow) => void;
}

export default function DashboardOverview({
  employees,
  loading,
  onViewEmployee,
}: DashboardOverviewProps) {
  const [attendanceToday, setAttendanceToday] = useState<number | null>(null);
  const [pendingLeave, setPendingLeave] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      try {
        const [attendance, leaves] = await Promise.all([
          apiFetch<AttendanceRecord[]>("/api/v1/attendance/today"),
          apiFetch<LeaveRequest[]>("/api/v1/leave/requests?status=PENDING"),
        ]);
        if (cancelled) return;
        setAttendanceToday(attendance.length);
        setPendingLeave(leaves.length);
      } catch {
        // Ringkasan tambahan bersifat opsional; kartu utama tetap tampil.
      }
    }

    void loadSummary();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const active = employees.filter(
      (employee) => employee.status === "Active",
    ).length;
    const onLeave = employees.filter(
      (employee) => employee.status === "On Leave",
    ).length;
    const departments = new Set(employees.map((employee) => employee.department))
      .size;
    const now = new Date();
    const exitedThisMonth = employees.filter((employee) => {
      if (!employee.exit_date) return false;
      const exit = new Date(employee.exit_date);
      return (
        exit.getUTCFullYear() === now.getUTCFullYear() &&
        exit.getUTCMonth() === now.getUTCMonth()
      );
    }).length;

    return [
      { label: "Total Karyawan", value: employees.length, icon: <Icons.User /> },
      { label: "Aktif", value: active, icon: <Icons.Check /> },
      { label: "Sedang Cuti", value: onLeave, icon: <Icons.Calendar /> },
      {
        label: "Hadir Hari Ini",
        value: attendanceToday ?? "…",
        icon: <Icons.Clock />,
      },
      {
        label: "Cuti Pending",
        value: pendingLeave ?? "…",
        icon: <Icons.Mail />,
      },
      { label: "Departemen", value: departments, icon: <Icons.Building /> },
      {
        label: "Keluar Bulan Ini",
        value: exitedThisMonth,
        icon: <Icons.LogOut />,
      },
    ];
  }, [employees, attendanceToday, pendingLeave]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-slate-400 font-medium mb-1">
          People / <span className="text-slate-700 font-semibold">Dashboard</span>
        </p>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          HR Overview
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Ringkasan kondisi karyawan dan aktivitas terbaru.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4"
          >
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">
                {stat.label}
              </span>
              <span className="w-8 h-8 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center">
                {stat.icon}
              </span>
            </div>
            <p className="mt-3 text-2xl font-bold text-slate-900">
              {loading ? "…" : stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100">
          <h2 className="font-bold text-slate-900 text-sm">
            Karyawan Terbaru
          </h2>
        </div>
        {loading ? (
          <p className="p-6 text-center text-xs text-slate-400">
            Memuat data karyawan...
          </p>
        ) : employees.length === 0 ? (
          <p className="p-6 text-center text-xs text-slate-400">
            Belum ada data karyawan.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {employees.slice(0, 5).map((employee) => (
              <li key={employee.id}>
                <button
                  type="button"
                  onClick={() => onViewEmployee(employee)}
                  className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3 text-left hover:bg-slate-50"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-8 h-8 rounded-full ${employee.avatarBg} font-bold text-xs flex items-center justify-center shrink-0`}
                    >
                      {employee.initials}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-slate-900 truncate">
                        {employee.name}
                      </span>
                      <span className="block text-[11px] text-slate-400 truncate">
                        {employee.email}
                      </span>
                    </span>
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500 shrink-0">
                    {employee.department}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
