-- AlterTable Employee: jadwal kerja + lokasi kerja (geofence)
ALTER TABLE "Employee" ADD COLUMN "schedule_id" TEXT;
ALTER TABLE "Employee" ADD COLUMN "work_location_id" TEXT;

-- AlterTable AttendanceRecord: mode kerja + koordinat clock in
ALTER TABLE "AttendanceRecord" ADD COLUMN "work_mode" TEXT NOT NULL DEFAULT 'OFFICE';
ALTER TABLE "AttendanceRecord" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "AttendanceRecord" ADD COLUMN "longitude" DOUBLE PRECISION;

-- AlterTable LeaveType: kebijakan kuota & approval
ALTER TABLE "LeaveType" ADD COLUMN "requires_hr_approval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LeaveType" ADD COLUMN "carry_over_max" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeaveType" ADD COLUMN "min_service_months" INTEGER NOT NULL DEFAULT 0;

-- AlterTable LeaveBalance: carry-over + masa berlaku
ALTER TABLE "LeaveBalance" ADD COLUMN "carried_over" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeaveBalance" ADD COLUMN "expires_at" TIMESTAMP(3);

-- AlterTable LeaveRequest: tahap approval + lampiran
ALTER TABLE "LeaveRequest" ADD COLUMN "stage" TEXT NOT NULL DEFAULT 'MANAGER';
ALTER TABLE "LeaveRequest" ADD COLUMN "attachment_path" TEXT;
ALTER TABLE "LeaveRequest" ADD COLUMN "attachment_name" TEXT;

-- CreateTable PasswordResetToken
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable AttendanceCorrection
CREATE TABLE "AttendanceCorrection" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "attendance_id" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "requested_clock_in" TIMESTAMP(3),
    "requested_clock_out" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewer_id" TEXT,
    "reviewer_note" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable WorkSchedule
CREATE TABLE "WorkSchedule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" TEXT NOT NULL DEFAULT '09:00',
    "end_time" TEXT NOT NULL DEFAULT '17:00',
    "late_tolerance_minutes" INTEGER NOT NULL DEFAULT 0,
    "work_days" TEXT NOT NULL DEFAULT '1,2,3,4,5',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable WorkLocation
CREATE TABLE "WorkLocation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radius_meters" INTEGER NOT NULL DEFAULT 150,
    "allow_wfh" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable Holiday
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'NATIONAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable EmploymentHistory
CREATE TABLE "EmploymentHistory" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "effective_date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmploymentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_hash_key" ON "PasswordResetToken"("token_hash");
CREATE INDEX "PasswordResetToken_user_id_idx" ON "PasswordResetToken"("user_id");
CREATE INDEX "PasswordResetToken_expires_at_idx" ON "PasswordResetToken"("expires_at");

CREATE INDEX "AttendanceCorrection_status_idx" ON "AttendanceCorrection"("status");
CREATE INDEX "AttendanceCorrection_employee_id_date_idx" ON "AttendanceCorrection"("employee_id", "date");

CREATE UNIQUE INDEX "WorkSchedule_name_key" ON "WorkSchedule"("name");
CREATE UNIQUE INDEX "WorkLocation_name_key" ON "WorkLocation"("name");
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

CREATE INDEX "EmploymentHistory_employee_id_effective_date_idx" ON "EmploymentHistory"("employee_id", "effective_date");

CREATE INDEX "Employee_schedule_id_idx" ON "Employee"("schedule_id");
CREATE INDEX "Employee_work_location_id_idx" ON "Employee"("work_location_id");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "WorkSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_work_location_id_fkey" FOREIGN KEY ("work_location_id") REFERENCES "WorkLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "AttendanceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmploymentHistory" ADD CONSTRAINT "EmploymentHistory_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
