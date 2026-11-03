"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Icons } from "./Icons";
import { apiFetch } from "../lib/api";
import type { NotificationItem } from "../lib/types";

interface HeaderProps {
  setIsAddModalOpen: (val: boolean) => void;
  setIsCommandPaletteOpen: (val: boolean) => void;
  canManageEmployees: boolean;
}

export default function Header({
  setIsAddModalOpen,
  setIsCommandPaletteOpen,
  canManageEmployees,
}: HeaderProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [ready, setReady] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await apiFetch<{
        items: NotificationItem[];
        unreadCount: number;
      }>("/api/v1/notifications");
      setItems(data.items);
      setUnreadCount(data.unreadCount);
      setReady(true);
    } catch {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    // Tunda pemuatan awal satu tick agar setState tidak terjadi saat commit.
    const initial = window.setTimeout(() => void loadNotifications(), 0);
    const timer = window.setInterval(() => {
      void loadNotifications();
    }, 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [loadNotifications]);

  const markAllRead = async () => {
    try {
      await apiFetch("/api/v1/notifications/read-all", {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      setUnreadCount(0);
      setItems((previous) => previous.map((item) => ({ ...item, read: true })));
    } catch {
      // Diamkan: notifikasi akan dimuat ulang pada polling berikutnya.
    }
  };

  const markRead = async (id: string) => {
    try {
      await apiFetch(`/api/v1/notifications/${id}/read`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      setItems((previous) =>
        previous.map((item) =>
          item.id === id ? { ...item, read: true } : item,
        ),
      );
      setUnreadCount((previous) => Math.max(0, previous - 1));
    } catch {
      // Diamkan.
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-6 flex items-center justify-between gap-4 sticky top-0 z-10 shadow-sm/50">
      <div className="flex items-center gap-4 flex-1 max-w-md">
        <div
          onClick={() => setIsCommandPaletteOpen(true)}
          className="relative w-full cursor-pointer group"
        >
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 group-hover:text-rose-500 transition">
            <Icons.Search />
          </span>
          <input
            type="text"
            readOnly
            placeholder="Search people, documents, teams..."
            className="w-full pl-9 pr-14 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 cursor-pointer group-hover:bg-slate-100/80 transition"
          />
          <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center">
            <kbd className="px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 bg-white border border-slate-200 rounded-md shadow-2xs flex items-center gap-0.5">
              <Icons.Command /> K
            </kbd>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setOpen((previous) => !previous);
              if (!open) void loadNotifications();
            }}
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl transition relative"
            aria-label="Notifikasi"
          >
            <Icons.Bell />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden z-30">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-800">Notifikasi</p>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void markAllRead()}
                    className="text-[11px] font-semibold text-rose-600 hover:text-rose-700"
                  >
                    Tandai semua dibaca
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto">
                {!ready ? (
                  <p className="p-4 text-xs text-slate-400">Memuat...</p>
                ) : items.length === 0 ? (
                  <p className="p-4 text-xs text-slate-400">
                    Belum ada notifikasi.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {items.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => void markRead(item.id)}
                          className={`w-full text-left px-4 py-3 hover:bg-slate-50 ${
                            item.read ? "opacity-70" : ""
                          }`}
                        >
                          <p className="text-[11px] font-bold text-slate-800 flex items-center gap-2">
                            {!item.read && (
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            )}
                            {item.title}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {item.message}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-1">
                            {new Date(item.created_at).toLocaleString("id-ID", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {canManageEmployees && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-accent hover:bg-rose-600 text-white rounded-xl text-xs font-bold shadow-sm shadow-rose-200 transition active:scale-95"
          >
            <Icons.Plus /> Add Employee
          </button>
        )}
      </div>
    </header>
  );
}
