# Montreux HRIS

Monorepo HRIS dengan dua aplikasi:

- `apps/api` — Express 5 + Prisma 7 + PostgreSQL (driver adapter `pg`)
- `apps/web` — Next.js 16 + React 19 + Tailwind CSS 4

## Prasyarat

- Node.js 22+
- Docker Desktop (termasuk WSL 2) untuk PostgreSQL

## Setup dari nol

```bash
# 1. Install dependency
npm install

# 2. Nyalakan PostgreSQL di Docker
npm run db:up

# 3. Terapkan migration + isi data demo
npm run db:migrate
npm run db:seed

# 4. Jalankan API dan web sekaligus
npm run dev
```

- Web: http://localhost:3000
- API: http://localhost:5000/api/v1/employees
- Health check: http://localhost:5000/api/v1/health

## Login & buat akun

Buka http://localhost:3000, lalu masuk lewat halaman **/login** atau daftar
lewat **/register**. Seluruh data karyawan hanya bisa diakses setelah login.

Akun demo hasil `npm run db:seed`:

| Email | Password | Role |
| --- | --- | --- |
| `admin@montreux.co` | `Admin123!` | `SUPER_ADMIN` |
| `hr@montreux.co` | `Hr123456!` | `HR_ADMIN` |
| `fajar.nugroho@montreux.co` | `Manager123!` | `MANAGER` |
| `alexander.wright@montreux.co` | `Employee123!` | `EMPLOYEE` |
| `siti.rahmawati@montreux.co` | `Employee123!` | `EMPLOYEE` |

Catatan registrasi:

- Akun baru dari halaman **Buat akun** selalu mendapat role `EMPLOYEE`.
- Jika email sudah terdaftar di Employee Directory (mis. karyawan hasil seed)
  tetapi belum punya akun, karyawan bisa mengklaim akunnya dengan memasukkan
  **NIK yang sama**.
- Menambah karyawan baru (`POST /api/v1/employees`) hanya bisa dilakukan oleh
  `SUPER_ADMIN` dan `HR_ADMIN`.
- Password di-hash dengan **Argon2id**. Hash bcrypt lama otomatis di-upgrade
  ke Argon2id saat pengguna berhasil login.
- Access token JWT berumur pendek (`ACCESS_TOKEN_TTL`, default 15 menit) dan
  dikirim lewat header `Authorization: Bearer <token>`. Browser menyimpannya di
  `localStorage` (`hris_token`).
- Refresh token disimpan di cookie `httpOnly` (`hris_refresh`, path
  `/api/v1/auth`), berlaku `REFRESH_TOKEN_TTL_DAYS` (default 7 hari), dan
  **dirotasi setiap kali dipakai**. Jika token lama dipakai ulang, seluruh sesi
  pengguna dicabut.
- Web otomatis memanggil `/api/v1/auth/refresh` sekali saat menerima 401,
  lalu mengulang request semula. Logout mencabut refresh token di server.
- **Lupa password** mengirim tautan reset berisi token acak 32 byte (hash
  SHA-256 disimpan, berlaku 60 menit, sekali pakai). Memakai token mencabut
  semua refresh token pengguna. Bila `SMTP_HOST` belum di-set, tautan reset
  ditulis ke log API dan (hanya di non-production) dikembalikan sebagai
  `devResetLink` agar bisa diuji.

### Endpoint auth

| Method | Endpoint | Akses |
| --- | --- | --- |
| `POST` | `/api/v1/auth/register` | Publik |
| `POST` | `/api/v1/auth/login` | Publik |
| `POST` | `/api/v1/auth/refresh` | Cookie refresh token |
| `POST` | `/api/v1/auth/logout` | Cookie refresh token |
| `POST` | `/api/v1/auth/forgot-password` | Publik (rate limited) |
| `POST` | `/api/v1/auth/reset-password` | Publik (token sekali pakai) |
| `GET` | `/api/v1/auth/me` | Perlu token |

Contoh login:

```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@montreux.co","password":"Admin123!"}'
```

## Fitur MVP

Sudah berjalan end-to-end (API + UI):

- **Autentikasi** — register/login, Argon2id, RBAC, access token 15 menit,
  refresh token rotasi di cookie `httpOnly`, auto-refresh di web, logout yang
  mencabut sesi server, rate limit login (5 percobaan gagal per 15 menit),
  lupa/reset password dengan token sekali pakai (60 menit), dan audit log
  login berhasil/gagal.
- **Core HR** — CRUD karyawan (khusus `SUPER_ADMIN`/`HR_ADMIN`), soft delete,
  pencarian, filter departemen/status, riwayat jabatan, penugasan jadwal,
  lokasi kerja, dan atasan langsung, **org chart** yang mengikuti cakupan per
  peran, serta pembatasan data per peran.
- **Import & ekspor karyawan** — unduh template XLSX, preview import CSV/XLSX
  (validasi per baris: `create`/`update`/`error`), commit import, ekspor daftar
  karyawan ke CSV/XLSX (khusus HR).
- **Absensi** — clock in/out memakai waktu server (zona `Asia/Jakarta`),
  geofence untuk kerja `OFFICE`, `WFH` mengikuti kebijakan lokasi, status
  `Present`/`Late` berdasarkan jadwal + toleransi, satu record per karyawan per
  hari, pengajuan koreksi ber-approval, rekap bulanan, serta ekspor CSV/XLSX.
- **Cuti** — jenis cuti terkonfigurasi (kuota, pro-rata, carry-over maksimal,
  kedaluwarsa 31 Maret, masa kerja minimum, wajib lampiran, perlu approval HR),
  saldo per tahun, pengajuan dengan lampiran, deteksi bentrok tanggal, validasi
  saldo, approval berjenjang manager → HR, pembatalan, penyesuaian saldo oleh
  HR, kalender cuti tim, dan notifikasi in-app/email.
- **Notifikasi** — pusat notifikasi in-app dengan badge unread, tandai dibaca,
  polling berkala di header, dan email transaksional bila SMTP dikonfigurasi.
- **Dashboard & laporan** — headcount, status karyawan, kehadiran hari ini,
  cuti pending, karyawan baru/keluar dan turnover, laporan headcount, absensi
  per departemen, pemakaian cuti, ekspor saldo cuti, dan feed aktivitas hari
  ini. Semua ringkasan mengikuti cakupan data per peran.
- **Pengaturan HR** — jadwal kerja, lokasi geofence, hari libur nasional, dan
  jenis cuti (khusus `SUPER_ADMIN`/`HR_ADMIN`; bootstrap dapat dibaca semua
  peran untuk kebutuhan form).
- **Audit log** — mencatat perubahan karyawan, absensi, approval cuti, dan
  peristiwa autentikasi (siapa, kapan, nilai lama/baru). Hanya `SUPER_ADMIN`
  yang bisa membacanya.

### Cakupan data per peran

| Peran | Data karyawan yang terlihat |
| --- | --- |
| `SUPER_ADMIN`, `HR_ADMIN` | Semua karyawan, field sensitif terbuka |
| `MANAGER` | Diri sendiri + bawahan langsung, field sensitif dimasking |
| `EMPLOYEE` | Hanya dirinya sendiri, field sensitif dimasking |

Masking NIK, NPWP, BPJS, dan rekening bank dilakukan di server, jadi data asli
tidak pernah dikirim ke klien tanpa izin.

### Endpoint utama

| Method | Endpoint | Akses |
| --- | --- | --- |
| `GET` | `/api/v1/employees` | Semua peran (hasil mengikuti cakupan) |
| `GET` | `/api/v1/employees/:id` | Semua peran (hasil mengikuti cakupan) |
| `GET` | `/api/v1/employees/:id/history` | Semua peran (hasil mengikuti cakupan) |
| `POST` | `/api/v1/employees` | `SUPER_ADMIN`, `HR_ADMIN` |
| `PATCH` | `/api/v1/employees/:id` | `SUPER_ADMIN`, `HR_ADMIN` |
| `DELETE` | `/api/v1/employees/:id` | `SUPER_ADMIN`, `HR_ADMIN` (soft delete) |
| `GET` | `/api/v1/employees/export?format=csv\|xlsx` | `SUPER_ADMIN`, `HR_ADMIN` |
| `GET` | `/api/v1/employees/import/template` | `SUPER_ADMIN`, `HR_ADMIN` |
| `POST` | `/api/v1/employees/import/preview` | `SUPER_ADMIN`, `HR_ADMIN` |
| `POST` | `/api/v1/employees/import` | `SUPER_ADMIN`, `HR_ADMIN` |
| `POST` | `/api/v1/attendance/clock-in` | Perlu token + terhubung ke karyawan |
| `POST` | `/api/v1/attendance/clock-out` | Perlu token + terhubung ke karyawan |
| `GET` | `/api/v1/attendance/today` | Perlu token (mengikuti cakupan) |
| `GET` | `/api/v1/attendance/me?month=YYYY-MM` | Perlu token |
| `GET` | `/api/v1/attendance/summary?month=YYYY-MM` | Perlu token (mengikuti cakupan) |
| `GET` | `/api/v1/attendance/export?month=YYYY-MM` | `SUPER_ADMIN`, `HR_ADMIN` |
| `GET` | `/api/v1/attendance/corrections` | Perlu token (mengikuti cakupan) |
| `POST` | `/api/v1/attendance/corrections` | Perlu token |
| `PATCH` | `/api/v1/attendance/corrections/:id/decision` | `SUPER_ADMIN`, `HR_ADMIN`, `MANAGER` |
| `GET` | `/api/v1/leave/types` | Perlu token |
| `GET` | `/api/v1/leave/balances/me` | Perlu token |
| `GET` | `/api/v1/leave/balances/:employeeId` | Sendiri, atasan langsung, atau HR |
| `PATCH` | `/api/v1/leave/balances/:employeeId` | `SUPER_ADMIN`, `HR_ADMIN` |
| `GET` | `/api/v1/leave/requests?status=` | Perlu token (mengikuti cakupan) |
| `POST` | `/api/v1/leave/requests` | Perlu token |
| `GET` | `/api/v1/leave/requests/:id/attachment` | Pemohon, reviewer, atau HR |
| `PATCH` | `/api/v1/leave/requests/:id/decision` | `SUPER_ADMIN`, `HR_ADMIN`, `MANAGER` |
| `PATCH` | `/api/v1/leave/requests/:id/cancel` | Pemohon atau `SUPER_ADMIN`/`HR_ADMIN` |
| `GET` | `/api/v1/leave/calendar?month=YYYY-MM` | Perlu token (mengikuti cakupan) |
| `GET` | `/api/v1/notifications` | Perlu token (milik sendiri) |
| `PATCH` | `/api/v1/notifications/:id/read` | Perlu token (milik sendiri) |
| `PATCH` | `/api/v1/notifications/read-all` | Perlu token (milik sendiri) |
| `GET` | `/api/v1/settings/bootstrap` | Perlu token |
| `GET/POST/PATCH/DELETE` | `/api/v1/settings/schedules` | `SUPER_ADMIN`, `HR_ADMIN` (baca: semua peran) |
| `GET/POST/PATCH/DELETE` | `/api/v1/settings/locations` | `SUPER_ADMIN`, `HR_ADMIN` (baca: semua peran) |
| `GET/POST/PATCH/DELETE` | `/api/v1/settings/holidays` | `SUPER_ADMIN`, `HR_ADMIN` (baca: semua peran) |
| `GET/POST/PATCH/DELETE` | `/api/v1/settings/leave-types` | `SUPER_ADMIN`, `HR_ADMIN` (baca: semua peran) |
| `GET` | `/api/v1/reports/headcount` | Perlu token (mengikuti cakupan) |
| `GET` | `/api/v1/reports/attendance?month=YYYY-MM` | Perlu token (mengikuti cakupan) |
| `GET` | `/api/v1/reports/leave?year=YYYY` | Perlu token (mengikuti cakupan) |
| `GET` | `/api/v1/reports/leave-balances?year=YYYY` | `SUPER_ADMIN`, `HR_ADMIN` |
| `GET` | `/api/v1/reports/today` | Perlu token (mengikuti cakupan) |
| `GET` | `/api/v1/audit-logs` | `SUPER_ADMIN` |

### Pengujian & CI

```bash
npm test             # unit test API (Vitest)
npm run test:coverage # unit test + laporan cakupan (threshold 70%)
npm run typecheck    # TypeScript API + web
npm run lint         # ESLint web
npm run build        # build produksi API + web
```

Unit test berada di `apps/api/tests` dan mencakup logika bisnis inti:
perhitungan waktu/Jakarta & keterlambatan, geofence, kebijakan cuti
(pro-rata, carry-over, kedaluwarsa), token reset password, rate limit,
pembacaan spreadsheet, dan validasi upload. CI GitHub Actions
(`.github/workflows/ci.yml`) menjalankan PostgreSQL service, migration, seed,
typecheck, lint, coverage, dan build pada setiap push/PR.

### Catatan keamanan

- Password memakai **Argon2id** (19 MiB, t=2, p=1); hash bcrypt lama
  di-upgrade otomatis saat login berhasil.
- Access token JWT 15 menit dengan `jti`; refresh token dirotasi setiap kali
  dipakai dan token yang dipakai ulang mencabut seluruh sesi pengguna.
- Field sensitif (NIK, NPWP, BPJS, rekening bank) dimasking **di server** untuk
  peran selain HR.
- Row-level scoping diterapkan di endpoint daftar, detail, riwayat, absensi,
  cuti, dan laporan. Detail karyawan memakai `AND` antara scope dan `id` yang
  diminta sehingga tidak bisa dibypass lewat parameter URL.
- Login dibatasi 5 kegagalan per email+IP per 15 menit; lupa password dibatasi
  3 permintaan per email+IP per 15 menit. Respons lupa password selalu sama
  untuk email yang tidak terdaftar.
- Upload dibatasi 5 MB untuk lampiran cuti (PDF/PNG/JPG/WEBP) dan 10 MB untuk
  import (CSV/XLSX), disimpan dengan nama UUID, dan hanya bisa diunduh oleh
  pemohon/reviewer/HR yang berhak.
- API memakai Helmet, mematikan `x-powered-by`, membatasi body JSON/urlencoded
  1 MB, dan menolak JSON tidak valid dengan `400`.
- Web memakai security headers di `next.config.ts`: CSP (tanpa `unsafe-eval` di
  production), `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy` (geolocation untuk absensi), dan HSTS di production.
- CORS permissive hanya di development; di production hanya origin pada
  `CORS_ORIGIN` yang diizinkan.

### Batasan yang masih diketahui

- `npm audit --omit=dev` melaporkan 9 isu moderat pada dependensi transitif
  `exceljs` (`archiver`, `glob`, `minimatch`, `uuid`); audit penuh juga
  menampilkan `minimatch` lewat tooling ESLint. Tidak ada temuan high/critical.
  `npm audit fix --force` akan menurunkan versi `exceljs`/`eslint`, jadi belum
  dijalankan. Risiko diterima untuk saat ini dan perlu ditinjau ulang saat
  dependensi tersebut merilis perbaikan.
- Kolom sensitif belum dienkripsi di level database (masih bergantung pada
  pembatasan akses aplikasi dan diskripsi database).
- Notifikasi saat ini dipicu oleh event (pengajuan, approval, pembatalan).
  Pengingat terjadwal (mis. kontrak akan berakhir) dan pengumuman massal belum
  dibuat karena memerlukan scheduler/cron.
- Belum ada penetration test eksternal; pengujian keamanan yang dilakukan
  bersifat internal (IDOR/RBAC/masking/rate-limit/upload/header).

## Perintah lain

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Jalankan API + web bersamaan |
| `npm run db:down` | Hentikan container (data tetap tersimpan) |
| `npm run db:reset` | Hapus volume lalu buat ulang database |
| `npm run db:logs` | Lihat log PostgreSQL |
| `npm run db:studio` | Buka Prisma Studio |
| `npm run lint` | ESLint untuk aplikasi web |
| `npm run typecheck` | Cek TypeScript semua workspace |
| `npm test` | Unit test API (Vitest) |
| `npm run test:coverage` | Unit test + cakupan (threshold 70%) |
| `npm run build` | Build API + web |

Jika `npm run dev` menampilkan pesan port 3000/5000 sudah dipakai, hentikan
instance dev lama terlebih dahulu:

```powershell
# Windows PowerShell
Get-NetTCPConnection -LocalPort 3000,5000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

```bash
# Linux/macOS
lsof -ti:3000,5000 | xargs kill -9
```

## Konfigurasi environment

- `apps/api/.env` — `DATABASE_URL`, `PORT`, `DATABASE_SSL`, `CORS_ORIGIN`, `JWT_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS`, `APP_URL`, `UPLOAD_DIR`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`
- `apps/web/.env.local` — `NEXT_PUBLIC_API_URL` (opsional; kosongkan untuk memakai proxy same-origin Next.js ke API)
- `.env` (root, opsional) — kredensial container PostgreSQL

Secara default browser memanggil `/api/v1/*` di origin web sendiri (port 3000),
lalu Next.js meneruskannya ke `http://127.0.0.1:5000` lewat `rewrites`. Ini
menghindari masalah CORS dan membuat aplikasi tetap bisa dibuka lewat
`127.0.0.1` maupun IP LAN. Ubah target proxy dengan `API_PROXY_TARGET` bila
API berjalan di port/host lain.

Salin nilai dari file `.env.example` di masing-masing folder. Untuk PostgreSQL
yang berjalan di Docker lokal, biarkan `DATABASE_SSL=false` karena container
tidak memakai SSL.

## Reset database

```bash
npm run db:reset
npm run db:migrate
npm run db:seed
```
