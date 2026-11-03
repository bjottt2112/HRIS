export interface Employee {
  id: string;
  company_id: string;
  user_id: string | null;
  nik: string;
  name: string;
  email: string;
  phone: string | null;
  birth_date: string | null;
  address: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  department: string;
  role: string;
  employment: string;
  location: string;
  join_date: string;
  exit_date: string | null;
  status: string;
  npwp: string | null;
  bpjs: string | null;
  bank_account: string | null;
  manager_id: string | null;
  schedule_id: string | null;
  work_location_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeRow extends Employee {
  initials: string;
  avatarBg: string;
  deptColor: string;
}

export interface EmployeeFormValues {
  name: string;
  email: string;
  nik: string;
  department: string;
  role: string;
  employment: string;
  location: string;
  joinDate: string;
  status?: string;
  phone?: string;
  address?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  npwp?: string;
  bpjs?: string;
  bankAccount?: string;
  scheduleId?: string;
  workLocationId?: string;
  managerId?: string;
  effectiveDate?: string;
  changeReason?: string;
}

export type ToastType = "success" | "error";

export interface ToastMessage {
  message: string;
  type: ToastType;
}

export type SortKey = "name" | "department" | "role" | "status";

export interface SortConfig {
  key: SortKey;
  direction: "asc" | "desc";
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  date: string;
  clockIn: string;
  clockOut: string | null;
  status: string;
  location: string;
  workMode?: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface AttendanceCorrection {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  date: string;
  requestedClockIn: string | null;
  requestedClockOut: string | null;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewerNote: string | null;
  reviewerName: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface AttendanceSummaryRow {
  employeeId: string;
  employeeName: string;
  department: string;
  scheduleName: string | null;
  workingDays: number;
  present: number;
  late: number;
  onLeave: number;
  absent: number;
  attendanceRate: number;
}

export interface WorkSchedule {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  late_tolerance_minutes: number;
  work_days: string;
}

export interface WorkLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  allow_wfh: boolean;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
  type: string;
}

export interface EmploymentHistoryItem {
  id: string;
  employee_id: string;
  department: string;
  role: string;
  effective_date: string;
  reason: string | null;
  created_at: string;
}

export interface SettingsBootstrap {
  schedules: WorkSchedule[];
  locations: WorkLocation[];
  holidays: Holiday[];
  leaveTypes: LeaveType[];
}

export interface ImportPreviewRow {
  line: number;
  action: "create" | "update" | "error";
  employeeId: string | null;
  nik: string;
  name: string;
  email: string;
  department: string;
  role: string;
  errors: string[];
}

export interface ImportPreview {
  total: number;
  createCount: number;
  updateCount: number;
  errorCount: number;
  rows: ImportPreviewRow[];
}

export interface ImportResult {
  ok: boolean;
  created: number;
  updated: number;
  skippedCount: number;
  skipped: Array<{ line: number; errors: string[] }>;
}

export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  default_quota: number;
  requires_attachment: boolean;
  requires_hr_approval: boolean;
  carry_over_max: number;
  min_service_months: number;
}

export interface LeaveBalance {
  id: string;
  year: number;
  entitled: number;
  carriedOver: number;
  used: number;
  remaining: number;
  expiresAt: string | null;
  leaveType: Pick<LeaveType, "id" | "code" | "name">;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  leaveType: { id: string; code: string; name: string };
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  stage: string;
  attachmentName: string | null;
  hasAttachment: boolean;
  reviewerNote: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface LeaveCalendarItem {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: LeaveStatus;
  stage: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

export type UserRole = "SUPER_ADMIN" | "HR_ADMIN" | "MANAGER" | "EMPLOYEE";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: string;
  employeeId: string | null;
  department: string | null;
  jobTitle: string | null;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface RegisterValues {
  name: string;
  email: string;
  password: string;
  nik: string;
  department: string;
  jobTitle: string;
}
