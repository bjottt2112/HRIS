"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Icons } from "./Icons";
import { useAuth } from "../lib/auth-context";
import { getInitials } from "../lib/format";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  HR_ADMIN: "HR Admin",
  MANAGER: "Manager",
  EMPLOYEE: "Employee",
};

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  setIsClockInModalOpen: (val: boolean) => void;
  setIsLeaveModalOpen: (val: boolean) => void;
  setIsSettingsOpen: (val: boolean) => void;
  pendingLeaves: number;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  setIsClockInModalOpen,
  setIsLeaveModalOpen,
  setIsSettingsOpen,
  pendingLeaves,
}: SidebarProps) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const displayName = user?.name ?? "Guest";
  const roleLabel = user ? (ROLE_LABELS[user.role] ?? user.role) : "-";

  const handleLogout = () => {
    void logout();
    router.replace("/login");
  };
  return (
    <aside className="w-full md:w-64 bg-white border-r border-slate-200/80 flex flex-col justify-between shrink-0 z-20">
      <div>
        <div className="h-16 flex items-center px-6 gap-3 border-b border-slate-100">
          <div className="w-8 h-8 rounded-xl bg-brand-accent flex items-center justify-center text-white font-extrabold text-lg shadow-md shadow-rose-200">
            M
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-xl text-slate-900 tracking-tight leading-none">
              Montreux
            </span>
            <span className="text-[10px] text-slate-400 font-semibold tracking-wider">
              HRIS PLATFORM
            </span>
          </div>
        </div>

        <nav className="p-4 space-y-5 text-xs font-semibold">
          <div>
            <div className="px-3 mb-1.5 text-[10px] tracking-wider text-slate-400 font-bold uppercase">
              Overview
            </div>
            <div className="space-y-0.5">
              <button
                onClick={() => setActiveTab("Dashboard")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition ${activeTab === "Dashboard" ? "bg-rose-50 text-rose-600 font-bold" : "text-slate-600 hover:bg-slate-50"}`}
              >
                <Icons.Dashboard /> Dashboard
              </button>
            </div>
          </div>

          <div>
            <div className="px-3 mb-1.5 text-[10px] tracking-wider text-slate-400 font-bold uppercase">
              People
            </div>
            <div className="space-y-0.5">
              <button
                onClick={() => setActiveTab("Employees")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition ${activeTab === "Employees" ? "bg-rose-50 text-rose-600 font-bold border-r-2 border-rose-600" : "text-slate-600 hover:bg-slate-50"}`}
              >
                <Icons.User /> Employees
              </button>
              <button
                onClick={() => setActiveTab("Organization")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition ${activeTab === "Organization" ? "bg-rose-50 text-rose-600 font-bold border-r-2 border-rose-600" : "text-slate-600 hover:bg-slate-50"}`}
              >
                <Icons.Building /> Organization
              </button>
              <button
                onClick={() => setIsClockInModalOpen(true)}
                className="w-full flex items-center justify-between px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg transition group"
              >
                <span className="flex items-center gap-3">
                  <Icons.Clock /> Attendance
                </span>
                <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded font-bold">
                  GPS
                </span>
              </button>
              <button
                onClick={() => setIsLeaveModalOpen(true)}
                className="w-full flex items-center justify-between px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg transition"
              >
                <span className="flex items-center gap-3">
                  <Icons.Calendar /> Leave Requests
                </span>
                {pendingLeaves > 0 && (
                  <span className="bg-rose-100 text-rose-700 text-[10px] px-1.5 py-0.5 rounded font-bold">
                    {pendingLeaves}
                  </span>
                )}
              </button>
              {(user?.role === "SUPER_ADMIN" || user?.role === "HR_ADMIN") && (
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg transition"
                >
                  <Icons.Shield /> Pengaturan HR
                </button>
              )}
            </div>
          </div>
        </nav>
      </div>

      <div className="p-4 border-t border-slate-100 space-y-3">
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-2 px-3 text-xs font-semibold text-slate-400 hover:text-rose-600 transition"
        >
          <Icons.LogOut /> Sign out
        </button>
        <div className="p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-slate-900 text-white font-bold flex items-center justify-center text-xs shadow-sm shrink-0">
              {user ? getInitials(displayName) : "??"}
            </div>
            <div className="text-left leading-tight min-w-0">
              <p className="text-xs font-bold text-slate-800 truncate">
                {displayName}
              </p>
              <p className="text-[11px] text-slate-400">{roleLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="text-slate-400 hover:text-slate-600 shrink-0"
            aria-label="Sign out"
          >
            <Icons.ChevronDown />
          </button>
        </div>
      </div>
    </aside>
  );
}
