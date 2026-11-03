"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { Icons } from "../components/Icons";
import DashboardOverview from "../components/DashboardOverview";
import OrgChart from "../components/OrgChart";
import EmployeeFormModal from "../components/EmployeeFormModal";
import EmployeeDetailModal from "../components/EmployeeDetailModal";
import AttendanceModal from "../components/AttendanceModal";
import LeaveModal from "../components/LeaveModal";
import ImportEmployeesModal from "../components/ImportEmployeesModal";
import SettingsModal from "../components/SettingsModal";
import CommandPalette from "../components/CommandPalette";
import Pagination from "../components/Pagination";
import Toast from "../components/Toast";
import { apiDownload, apiFetch, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { departmentColor, getInitials } from "../lib/format";
import type {
  Employee,
  EmployeeFormValues,
  EmployeeRow,
  LeaveRequest,
  SortConfig,
  SortKey,
  ToastMessage,
  ToastType,
} from "../lib/types";

const ITEMS_PER_PAGE = 8;
const STATUS_OPTIONS = ["Active", "On Leave", "Inactive"];

const avatarColors = [
  "bg-rose-100 text-rose-700",
  "bg-blue-100 text-blue-700",
  "bg-amber-100 text-amber-700",
  "bg-emerald-100 text-emerald-700",
  "bg-purple-100 text-purple-700",
  "bg-sky-100 text-sky-700",
];

function toRow(employee: Employee, index: number): EmployeeRow {
  return {
    ...employee,
    initials: getInitials(employee.name),
    avatarBg: avatarColors[index % avatarColors.length],
    deptColor: departmentColor(employee.department),
  };
}

export default function HRISDashboard() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("Employees");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDept, setSelectedDept] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: "name",
    direction: "asc",
  });

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isClockInModalOpen, setIsClockInModalOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [selectedEmployeeDetail, setSelectedEmployeeDetail] =
    useState<EmployeeRow | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeRow | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback(
    (message: string, type: ToastType = "success") => {
      setToast({ message, type });
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), 4000);
    },
    [],
  );

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  const refreshEmployees = useCallback(async () => {
    const data = await apiFetch<Employee[]>("/api/v1/employees");
    setEmployees(data.map(toRow));
  }, []);

  const refreshPendingLeaves = useCallback(async () => {
    try {
      const data = await apiFetch<LeaveRequest[]>(
        "/api/v1/leave/requests?status=PENDING",
      );
      setPendingLeaveCount(data.length);
    } catch {
      // Badge opsional; abaikan kegagalan.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialEmployees() {
      if (!user) return;

      try {
        const data = await apiFetch<Employee[]>("/api/v1/employees");
        if (cancelled) return;
        setEmployees(data.map(toRow));
        void refreshPendingLeaves();
      } catch (error) {
        if (cancelled) return;

        if (error instanceof ApiError && error.status === 401) {
          void logout();
          router.replace("/login");
          return;
        }

        showToast(
          error instanceof Error
            ? error.message
            : "Gagal memuat data karyawan.",
          "error",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialEmployees();
    return () => {
      cancelled = true;
    };
  }, [user, showToast, logout, router, refreshPendingLeaves]);

  // Arahkan ke halaman login jika belum punya sesi.
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  // Shortcut ⌘K / Ctrl+K dan tombol Escape.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsCommandPaletteOpen((previous) => !previous);
      }

      if (event.key === "Escape") {
        setIsCommandPaletteOpen(false);
        setIsAddModalOpen(false);
        setIsClockInModalOpen(false);
        setIsLeaveModalOpen(false);
        setIsImportModalOpen(false);
        setIsSettingsOpen(false);
        setSelectedEmployeeDetail(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSaveEmployee = useCallback(
    async (values: EmployeeFormValues) => {
      setSubmitting(true);
      try {
        const editingId = editingEmployee?.id;

        if (editingId) {
          await apiFetch<Employee>(`/api/v1/employees/${editingId}`, {
            method: "PATCH",
            body: JSON.stringify(values),
          });
        } else {
          await apiFetch<Employee>("/api/v1/employees", {
            method: "POST",
            body: JSON.stringify(values),
          });
        }

        setIsAddModalOpen(false);
        setEditingEmployee(null);
        setSelectedEmployeeDetail(null);
        showToast(
          editingId
            ? `Data ${values.name} berhasil diperbarui.`
            : `Karyawan ${values.name} berhasil disimpan ke database.`,
        );
        try {
          await refreshEmployees();
        } catch {
          showToast(
            "Data tersimpan, tetapi daftar karyawan gagal dimuat ulang.",
            "error",
          );
        }
      } finally {
        setSubmitting(false);
      }
    },
    [editingEmployee, refreshEmployees, showToast],
  );

  const handleDeleteEmployee = useCallback(
    async (employee: EmployeeRow) => {
      setDeletingId(employee.id);
      try {
        await apiFetch(`/api/v1/employees/${employee.id}`, {
          method: "DELETE",
        });
        setSelectedEmployeeDetail(null);
        showToast(`${employee.name} dinonaktifkan dan dihapus dari direktori.`);
        await refreshEmployees();
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : "Gagal menghapus karyawan.",
          "error",
        );
      } finally {
        setDeletingId(null);
      }
    },
    [refreshEmployees, showToast],
  );

  const handleSort = (key: SortKey) => {
    setSortConfig((previous) => ({
      key,
      direction:
        previous.key === key && previous.direction === "asc" ? "desc" : "asc",
    }));
    setCurrentPage(1);
  };

  const filteredAndSortedEmployees = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();

    const result = employees.filter((employee) => {
      const matchesSearch =
        employee.name.toLowerCase().includes(keyword) ||
        employee.email.toLowerCase().includes(keyword) ||
        employee.role.toLowerCase().includes(keyword);
      const matchesDept =
        selectedDept === "All" || employee.department === selectedDept;
      const matchesStatus =
        selectedStatus === "All" || employee.status === selectedStatus;

      return matchesSearch && matchesDept && matchesStatus;
    });

    return result.sort((first, second) => {
      const firstValue = first[sortConfig.key].toLowerCase();
      const secondValue = second[sortConfig.key].toLowerCase();

      if (firstValue === secondValue) return 0;

      const comparison = firstValue < secondValue ? -1 : 1;
      return sortConfig.direction === "asc" ? comparison : -comparison;
    });
  }, [employees, searchQuery, selectedDept, selectedStatus, sortConfig]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredAndSortedEmployees.length / ITEMS_PER_PAGE),
  );
  const safePage = Math.min(currentPage, totalPages);
  const paginatedEmployees = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filteredAndSortedEmployees.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredAndSortedEmployees, safePage]);

  const renderSortIcon = (key: SortKey) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === "asc" ? (
      <Icons.SortAsc />
    ) : (
      <Icons.SortDesc />
    );
  };

  const canManageEmployees =
    user?.role === "SUPER_ADMIN" || user?.role === "HR_ADMIN";

  if (authLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#F8FAFC]">
        <p className="text-xs font-medium text-slate-400">Memuat sesi...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F8FAFC]">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        setIsClockInModalOpen={setIsClockInModalOpen}
        setIsLeaveModalOpen={setIsLeaveModalOpen}
        setIsSettingsOpen={setIsSettingsOpen}
        pendingLeaves={pendingLeaveCount}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto relative z-0">
        <Header
          setIsAddModalOpen={setIsAddModalOpen}
          setIsCommandPaletteOpen={setIsCommandPaletteOpen}
          canManageEmployees={canManageEmployees}
        />

        <div className="p-6 md:p-8 space-y-6 max-w-7xl w-full mx-auto">
          {activeTab === "Dashboard" ? (
            <DashboardOverview
              employees={employees}
              loading={loading}
              onViewEmployee={setSelectedEmployeeDetail}
            />
          ) : activeTab === "Organization" ? (
            <OrgChart
              employees={employees}
              loading={loading}
              onViewEmployee={setSelectedEmployeeDetail}
            />
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-400 font-medium mb-1">
                    People /{" "}
                    <span className="text-slate-700 font-semibold">
                      Employees
                    </span>
                  </div>
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                    Employee Directory
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Manage your workforce, roles, availability and employment
                    status.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {canManageEmployees && (
                    <>
                      <button
                        type="button"
                        onClick={() => setIsImportModalOpen(true)}
                        className="px-3.5 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800"
                      >
                        Import
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void apiDownload(
                            "/api/v1/employees/export?format=csv",
                            "karyawan.csv",
                          )
                        }
                        className="px-3.5 py-2 bg-white border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Export CSV
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void apiDownload(
                            "/api/v1/employees/export?format=xlsx",
                            "karyawan.xlsx",
                          )
                        }
                        className="px-3.5 py-2 bg-white border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Export XLSX
                      </button>
                    </>
                  )}
                  <select
                    value={selectedDept}
                    onChange={(event) => {
                      setSelectedDept(event.target.value);
                      setCurrentPage(1);
                    }}
                    className="appearance-none bg-white border border-slate-200/80 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs outline-none"
                  >
                    <option value="All">All Departments</option>
                    <option value="Product">Product</option>
                    <option value="Engineering">Engineering</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Finance">Finance</option>
                    <option value="People">People</option>
                  </select>

                  <select
                    value={selectedStatus}
                    onChange={(event) => {
                      setSelectedStatus(event.target.value);
                      setCurrentPage(1);
                    }}
                    className="appearance-none bg-white border border-slate-200/80 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs outline-none"
                  >
                    <option value="All">All Status</option>
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
                <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-900 text-sm">
                      Employees
                    </span>
                    <span className="text-xs text-slate-400 font-medium">
                      {filteredAndSortedEmployees.length} members
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                        <Icons.Search />
                      </span>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(event) => {
                          setSearchQuery(event.target.value);
                          setCurrentPage(1);
                        }}
                        placeholder="Search by name, role or email..."
                        className="w-48 sm:w-64 pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        <th className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => handleSort("name")}
                            className="inline-flex items-center hover:text-slate-700"
                          >
                            Employee {renderSortIcon("name")}
                          </button>
                        </th>
                        <th className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => handleSort("department")}
                            className="inline-flex items-center hover:text-slate-700"
                          >
                            Department {renderSortIcon("department")}
                          </button>
                        </th>
                        <th className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => handleSort("role")}
                            className="inline-flex items-center hover:text-slate-700"
                          >
                            Role {renderSortIcon("role")}
                          </button>
                        </th>
                        <th className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => handleSort("status")}
                            className="inline-flex items-center hover:text-slate-700"
                          >
                            Status {renderSortIcon("status")}
                          </button>
                        </th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-normal">
                      {loading ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="py-8 text-center text-slate-400"
                          >
                            Loading data karyawan dari database PostgreSQL...
                          </td>
                        </tr>
                      ) : paginatedEmployees.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="py-8 text-center text-slate-400"
                          >
                            Belum ada data karyawan yang cocok. Silakan ubah
                            filter atau klik Add Employee.
                          </td>
                        </tr>
                      ) : (
                        paginatedEmployees.map((employee) => (
                          <tr
                            key={employee.id}
                            className="hover:bg-slate-50/80 transition"
                          >
                            <td
                              className="py-3.5 px-4 cursor-pointer group"
                              onClick={() =>
                                setSelectedEmployeeDetail(employee)
                              }
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-8 h-8 rounded-full ${employee.avatarBg} font-bold flex items-center justify-center shrink-0`}
                                >
                                  {employee.initials}
                                </div>
                                <div>
                                  <div className="font-semibold text-slate-900 group-hover:text-rose-600 transition">
                                    {employee.name}
                                  </div>
                                  <div className="text-[11px] text-slate-400">
                                    {employee.email}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`w-2 h-2 rounded-full ${employee.deptColor}`}
                                />
                                <span className="font-medium text-slate-800">
                                  {employee.department}
                                </span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-medium text-slate-800">
                              {employee.role}
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                                  employee.status === "Active"
                                    ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                    : employee.status === "On Leave"
                                      ? "bg-amber-50 text-amber-600 border-amber-200"
                                      : "bg-slate-100 text-slate-500 border-slate-200"
                                }`}
                              >
                                {employee.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedEmployeeDetail(employee)
                                }
                                className="p-1 text-slate-400 hover:bg-slate-100 rounded-lg"
                                aria-label={`Lihat detail ${employee.name}`}
                              >
                                <Icons.MoreVertical />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  page={safePage}
                  totalPages={totalPages}
                  totalItems={filteredAndSortedEmployees.length}
                  onPageChange={setCurrentPage}
                />
              </div>
            </>
          )}
        </div>
      </main>

      {isAddModalOpen && (
        <EmployeeFormModal
          submitting={submitting}
          initial={editingEmployee}
          onClose={() => {
            setIsAddModalOpen(false);
            setEditingEmployee(null);
          }}
          onSubmit={handleSaveEmployee}
        />
      )}

      {selectedEmployeeDetail && (
        <EmployeeDetailModal
          employee={selectedEmployeeDetail}
          canManage={canManageEmployees}
          deleting={deletingId === selectedEmployeeDetail.id}
          onEdit={(employee) => {
            setEditingEmployee(employee);
            setSelectedEmployeeDetail(null);
            setIsAddModalOpen(true);
          }}
          onDelete={(employee) => void handleDeleteEmployee(employee)}
          onClose={() => setSelectedEmployeeDetail(null)}
        />
      )}

      {isClockInModalOpen && (
        <AttendanceModal onClose={() => setIsClockInModalOpen(false)} />
      )}

      {isLeaveModalOpen && (
        <LeaveModal
          onClose={() => setIsLeaveModalOpen(false)}
          onChanged={() => void refreshPendingLeaves()}
        />
      )}

      {isImportModalOpen && (
        <ImportEmployeesModal
          onClose={() => setIsImportModalOpen(false)}
          onImported={refreshEmployees}
          onError={(message) => showToast(message, "error")}
          onSuccess={(message) => showToast(message)}
        />
      )}

      {isSettingsOpen && (
        <SettingsModal
          onClose={() => setIsSettingsOpen(false)}
          onError={(message) => showToast(message, "error")}
          onSuccess={(message) => showToast(message)}
        />
      )}

      {isCommandPaletteOpen && (
        <CommandPalette
          employees={employees}
          onSelectEmployee={setSelectedEmployeeDetail}
          onNavigate={setActiveTab}
          onClose={() => setIsCommandPaletteOpen(false)}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
}
