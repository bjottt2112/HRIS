# PRD — Aplikasi HRIS (Human Resource Information System)

**Versi** 1.0 (Draft) · **Tanggal** 26 Oktober 2026 · **Status** Untuk review · **Owner** Product Manager (isi nama)

## 1. Ringkasan Eksekutif

HRIS adalah aplikasi web untuk mengelola siklus kerja karyawan di perusahaan skala kecil–menengah (sekitar 50–1.000 karyawan) di Indonesia: data karyawan, absensi, cuti, lembur, penggajian, dan pelaporan. Aplikasi dibangun responsif (nyaman dipakai dari ponsel) dengan Next.js + React + Tailwind di frontend, Express.js di backend, PostgreSQL sebagai database, dan di-deploy di Vercel.

MVP berfokus pada tiga hal: (1) data karyawan yang terpusat dan rapi, (2) absensi dan cuti yang benar-benar dipakai setiap hari, (3) persetujuan berjenjang yang terlacak. Payroll lengkap (BPJS, PPh 21, slip gaji) masuk Fase 2 karena butuh validasi regulasi yang lebih ketat.

## 2. Latar Belakang dan Masalah

- Data karyawan tersebar di spreadsheet dan folder bersama, sulit dijaga akurat dan aman.
- Absensi memakai catatan manual atau mesin terpisah, sehingga rekap akhir bulan memakan waktu.
- Pengajuan cuti lewat chat atau email tidak terlacak; saldo cuti sering diperdebatkan.
- Perhitungan gaji, BPJS, dan PPh 21 rawan salah hitung dan sulit diaudit.
- Manajemen tidak punya gambaran real-time soal kehadiran, cuti, dan biaya SDM.

## 3. Tujuan, Non-Tujuan, dan Metrik

**Tujuan**

1. Satu sumber data karyawan yang akurat dengan kontrol akses berbasis peran.
2. Memangkas waktu administrasi HR untuk rekap absensi dan cuti minimal 70%.
3. Karyawan dapat clock in/out dan mengajukan cuti sendiri (self-service) dari ponsel.
4. Fondasi teknis yang siap dikembangkan ke payroll dan modul lain tanpa rewrite.

**Non-tujuan (di luar MVP)**

- Aplikasi mobile native (cukup web responsif/PWA).
- Rekrutmen (ATS), penilaian kinerja, dan learning management.
- Integrasi mesin fingerprint dan software akuntansi.
- Billing dan multi-tenant SaaS publik.

**Metrik keberhasilan**

| Metrik | Target (3 bulan setelah rilis) |
| --- | --- |
| Karyawan aktif mingguan | ≥ 85% |
| Pengajuan cuti yang diproses lewat aplikasi | ≥ 95% |
| Waktu rekap absensi bulanan oleh HR | < 2 jam (dari berhari-hari) |
| Rata-rata waktu persetujuan cuti | < 24 jam |
| Catatan absensi yang perlu dikoreksi | < 3% |
| Kepuasan pengguna (CSAT) | ≥ 4,0 dari 5 |

## 4. Persona dan Peran

| Peran | Deskripsi | Kebutuhan utama |
| --- | --- | --- |
| Super Admin | Pemilik sistem / IT | Konfigurasi perusahaan, peran dan izin, audit log |
| HR Admin | Tim HR | Kelola data karyawan, kebijakan cuti, koreksi absensi, laporan; payroll (Fase 2) |
| Manajer | Atasan langsung | Menyetujui cuti, koreksi, dan lembur; melihat kehadiran tim |
| Karyawan | Seluruh staf | Clock in/out, ajukan cuti, lihat saldo dan profil; slip gaji (Fase 2) |
| Finance | Tim keuangan (Fase 2) | Review dan finalisasi payroll, file transfer bank |

## 5. Ruang Lingkup per Fase

| Fase | Modul |
| --- | --- |
| Fase 1 — MVP | Autentikasi dan RBAC, Core HR dan struktur organisasi, Absensi, Cuti dan izin, Notifikasi, Dashboard dan laporan dasar, Audit log |
| Fase 2 | Lembur, Payroll (BPJS, PPh 21, THR), slip gaji, Reimbursement, Manajemen dokumen, 2FA |
| Fase 3 | Onboarding/offboarding, Penilaian kinerja, Integrasi (fingerprint, akuntansi, WhatsApp), SSO, PWA |

## 6. Kebutuhan Fungsional

Prioritas: **P0** = wajib MVP, **P1** = Fase 2, **P2** = Fase 3.

### 6.1 Autentikasi dan Otorisasi

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-AUTH-01 | Login email + password; password di-hash dengan Argon2id | P0 |
| FR-AUTH-02 | Reset password via email dengan token sekali pakai berbatas waktu | P0 |
| FR-AUTH-03 | RBAC: peran dan permission per modul dan aksi (lihat, buat, ubah, setujui, ekspor) | P0 |
| FR-AUTH-04 | Sesi aman: access token pendek + refresh token rotasi di cookie httpOnly | P0 |
| FR-AUTH-05 | 2FA (TOTP) untuk Super Admin dan HR Admin | P1 |
| FR-AUTH-06 | SSO Google Workspace / Microsoft | P2 |

### 6.2 Core HR dan Struktur Organisasi

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-EMP-01 | CRUD profil karyawan: data pribadi, kontak, kontak darurat, rekening bank, NIK, NPWP, nomor BPJS | P0 |
| FR-EMP-02 | Status kepegawaian (tetap, kontrak, magang), tanggal masuk/keluar, riwayat jabatan dan mutasi | P0 |
| FR-EMP-03 | Struktur organisasi: departemen, jabatan, lokasi kerja, atasan langsung, org chart | P0 |
| FR-EMP-04 | Import massal CSV/XLSX dengan validasi dan preview error sebelum disimpan | P0 |
| FR-EMP-05 | Pencarian, filter, sortir, dan ekspor daftar karyawan | P0 |
| FR-EMP-06 | Field sensitif (NIK, NPWP, rekening, gaji) di-mask dan hanya terlihat oleh peran berizin | P0 |
| FR-EMP-07 | Karyawan mengajukan perubahan data pribadi, HR menyetujui | P1 |
| FR-EMP-08 | Pengingat kontrak yang akan berakhir (30/14/7 hari) | P1 |

### 6.3 Absensi

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-ATT-01 | Clock in/out dari web (browser ponsel/desktop) dengan timestamp dari server | P0 |
| FR-ATT-02 | Validasi lokasi (geofence radius kantor); opsi WFH dan dinas luar sesuai kebijakan | P0 |
| FR-ATT-03 | Jadwal kerja dan shift, toleransi keterlambatan, hari kerja per departemen | P0 |
| FR-ATT-04 | Kalender libur nasional dan cuti bersama yang diinput HR setiap tahun | P0 |
| FR-ATT-05 | Pengajuan koreksi absensi dengan alasan dan approval | P0 |
| FR-ATT-06 | Rekap harian dan bulanan: hadir, terlambat, alpa, cuti, libur; ekspor ke Excel | P0 |
| FR-ATT-07 | Foto selfie saat clock in sebagai bukti tambahan | P1 |

### 6.4 Cuti dan Izin

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-LV-01 | Jenis cuti dapat dikonfigurasi (tahunan, sakit, melahirkan, menikah, duka, tanpa gaji) | P0 |
| FR-LV-02 | Kebijakan kuota: hak per tahun, akrual, carry-over, kedaluwarsa, masa tunggu karyawan baru | P0 |
| FR-LV-03 | Pengajuan cuti dengan lampiran (mis. surat dokter) dan pembatalan sebelum disetujui | P0 |
| FR-LV-04 | Alur persetujuan berjenjang yang dapat dikonfigurasi (atasan → HR) | P0 |
| FR-LV-05 | Saldo cuti real-time dan kalender cuti tim; deteksi bentrok jadwal | P0 |
| FR-LV-06 | Notifikasi email dan in-app untuk setiap perubahan status | P0 |

### 6.5 Lembur dan Payroll (Fase 2)

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-OT-01 | Pengajuan lembur, approval atasan, perhitungan jam dengan aturan yang dapat dikonfigurasi | P1 |
| FR-PAY-01 | Komponen gaji: pokok, tunjangan tetap/tidak tetap, potongan; histori perubahan gaji | P1 |
| FR-PAY-02 | Siklus payroll: draft → review → approve → final (terkunci, tidak bisa diubah) | P1 |
| FR-PAY-03 | Perhitungan iuran BPJS Kesehatan dan Ketenagakerjaan (porsi perusahaan dan karyawan) dengan tarif yang dapat diubah | P1 |
| FR-PAY-04 | Perhitungan PPh 21 (termasuk metode TER dan penyesuaian akhir tahun) | P1 |
| FR-PAY-05 | Integrasi otomatis dengan absensi, lembur, dan cuti tanpa gaji | P1 |
| FR-PAY-06 | THR, bonus, dan pembayaran non-rutin | P1 |
| FR-PAY-07 | Slip gaji PDF yang hanya dapat diakses karyawan bersangkutan | P1 |
| FR-PAY-08 | Ekspor file transfer bank dan laporan pendukung pajak | P1 |

### 6.6 Reimbursement, Dokumen, Notifikasi, dan Laporan

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-NTF-01 | Pusat notifikasi in-app dan email untuk approval, pengingat, dan pengumuman | P0 |
| FR-RPT-01 | Dashboard HR: headcount, kehadiran hari ini, cuti berjalan, karyawan baru/keluar, turnover | P0 |
| FR-RPT-02 | Dashboard manajer: kehadiran dan cuti tim | P0 |
| FR-AUD-01 | Audit log perubahan data sensitif dan aksi approval (siapa, kapan, nilai lama dan baru) | P0 |
| FR-RMB-01 | Pengajuan reimbursement dengan lampiran struk, approval, dan masuk ke payroll | P1 |
| FR-DOC-01 | Penyimpanan dokumen karyawan (kontrak, ijazah, sertifikat) dengan akses per peran | P1 |
| FR-ONB-01 | Checklist onboarding dan offboarding | P2 |

## 7. Alur Pengguna Utama

**Alur A — Absensi harian**

1. Karyawan membuka aplikasi dan menekan Clock In.
2. Sistem memeriksa sesi, jadwal hari itu, dan lokasi (geofence).
3. Server mencatat waktu (UTC) dan menetapkan status: tepat waktu atau terlambat.
4. Saat pulang, karyawan menekan Clock Out dan sistem menghitung durasi kerja.

Kriteria penerimaan: tidak bisa clock in dua kali tanpa clock out; waktu selalu berasal dari server, bukan perangkat; di luar geofence → ditolak atau ditandai 'perlu review' sesuai kebijakan perusahaan.

**Alur B — Pengajuan cuti**

1. Karyawan memilih jenis cuti, tanggal, alasan, dan lampiran bila perlu.
2. Sistem memeriksa saldo, bentrok libur, dan aturan jenis cuti.
3. Atasan menerima notifikasi lalu menyetujui atau menolak (dengan catatan).
4. HR menyetujui tahap akhir bila kebijakan mensyaratkan.
5. Saldo cuti dan rekap absensi diperbarui otomatis.

Kriteria penerimaan: pengajuan melebihi saldo ditolak dengan pesan jelas; setiap perubahan status tercatat di audit log; pemohon menerima notifikasi pada setiap tahap.

**Alur C — Proses payroll bulanan (Fase 2)**

1. HR membuka periode gaji, sistem menarik data absensi, lembur, cuti, dan reimbursement.
2. Sistem menghasilkan draft payroll beserta rincian BPJS dan PPh 21.
3. HR dan Finance me-review selisih terhadap bulan sebelumnya.
4. Payroll difinalisasi (terkunci), slip gaji terbit, dan file transfer bank dibuat.

Kriteria penerimaan: payroll final tidak dapat diubah (koreksi lewat periode penyesuaian); semua perhitungan dapat ditelusuri per komponen.

## 8. Kebutuhan Non-Fungsional

| Kategori | Target |
| --- | --- |
| Performa | p95 respons API untuk operasi CRUD < 500 ms; LCP halaman utama < 2,5 detik di jaringan 4G |
| Ketersediaan | ≥ 99,5% pada fase MVP |
| Skala | Hingga 1.000 karyawan dan 200 pengguna bersamaan tanpa perubahan arsitektur |
| Keamanan | HTTPS wajib, enkripsi data at rest, enkripsi kolom sensitif, rate limiting, mitigasi OWASP Top 10 |
| Backup dan pemulihan | Point-in-time recovery; RPO ≤ 24 jam, RTO ≤ 4 jam; uji restore berkala |
| Lokalisasi | Bahasa Indonesia (default) dan Inggris; zona waktu WIB/WITA/WIT; format Rupiah dan tanggal Indonesia |
| Responsif dan aksesibilitas | Mobile-first; WCAG 2.1 AA untuk alur utama |
| Observabilitas | Error tracking, log terstruktur dengan request ID, alert untuk error rate dan latensi |
| Kualitas kode | TypeScript strict, lint dan typecheck di CI, cakupan test minimal 70% untuk logika bisnis |

## 9. Arsitektur dan Tech Stack

| Layer | Pilihan | Catatan |
| --- | --- | --- |
| Frontend | Next.js (App Router), React, TypeScript | Server Components untuk halaman data-berat; Client Components untuk form dan interaksi |
| Styling | Tailwind CSS + shadcn/ui | Design token konsisten, komponen aksesibel |
| State dan form | TanStack Query, React Hook Form, Zod | Skema Zod dibagi dengan backend lewat package shared |
| Backend | Express.js + TypeScript | Berlapis: route → controller → service → repository |
| ORM dan migrasi | Prisma atau Drizzle | Migrasi versioned dan dijalankan di CI |
| Database | PostgreSQL (mis. Neon via Vercel Marketplace, atau Supabase) | Wajib lewat connection pooler; database branching untuk preview |
| Auth | JWT access token (15 menit) + refresh token rotasi, cookie httpOnly | Argon2id untuk password |
| File storage | Vercel Blob atau S3/R2 dengan presigned URL | Lampiran cuti, dokumen, foto |
| Email | Resend atau Amazon SES | Notifikasi dan reset password |
| Job terjadwal | Vercel Cron + queue (mis. Upstash QStash atau Inngest) | Rekap harian, pengingat, proses payroll |
| Observabilitas | Sentry, log terstruktur (pino), Vercel Analytics |  |
| Testing | Vitest/Jest, Supertest, Playwright | Unit, integrasi API, dan E2E |
| CI/CD | GitHub Actions + Vercel Git integration | Lint → typecheck → test → migrasi → deploy |

**Struktur repositori (monorepo)**

```
hris/
  apps/
    web/        Next.js (Vercel project 1)
    api/        Express.js (Vercel project 2)
  packages/
    shared/     skema Zod, tipe, konstanta
    config/     eslint, tsconfig, preset tailwind
  .github/workflows/
```

**Alur request**

Browser → Next.js (web) → Express API (api) → PostgreSQL (via pooler). Upload file langsung dari browser ke object storage memakai presigned URL yang diterbitkan API.

**Catatan penting untuk deployment di Vercel**

- Express berjalan sebagai Vercel Functions (serverless): API harus stateless, tanpa proses long-running dan tanpa state di memori.
- Koneksi database: gunakan connection pooler (PgBouncer/pooler provider) karena setiap invokasi function dapat membuka koneksi baru; atur ukuran pool kecil per instance.
- Ukuran body request di Vercel Functions dibatasi (kisaran beberapa MB), jadi upload file harus langsung ke object storage, tidak lewat API.
- Job terjadwal (rekap absensi harian, pengingat kontrak, payroll) memakai Vercel Cron; proses panjang dipecah per batch dan dijalankan lewat queue karena ada batas durasi function.
- Cookie sesi: letakkan web dan API di satu domain induk (mis. app.perusahaan.id dan api.perusahaan.id) atau proxy lewat rewrites Next.js agar cookie httpOnly dan CORS tidak bermasalah.
- Pilih region terdekat dengan pengguna dan database (mis. Singapura/sin1) untuk menekan latensi.
- Environment variable dan secret dikelola di Vercel; tiap pull request mendapat Preview Deployment dengan database branch terpisah.
- Batas durasi, ukuran bundle, dan fitur per paket Vercel dapat berubah; verifikasi di dokumentasi resmi sebelum finalisasi arsitektur.
- Jalur keluar: jika beban job berat meningkat, API dapat dipindah ke container (Railway/Fly.io/Render) tanpa mengubah kontrak API.

## 10. Model Data (Entitas Utama)

| Entitas | Atribut kunci |
| --- | --- |
| companies | id, nama, NPWP, zona waktu, pengaturan (disiapkan untuk multi-company) |
| users, roles, permissions | email, password\_hash, status, last\_login; peran dan izin per modul/aksi |
| employees | NIK karyawan, nama, kontak, tanggal lahir, status kepegawaian, tanggal masuk/keluar, user\_id, manager\_id |
| departments, positions, work\_locations | nama, parent, koordinat dan radius geofence |
| employment\_history | employee\_id, jabatan, departemen, tanggal efektif, alasan |
| work\_schedules, shifts | jam masuk/pulang, toleransi, hari kerja |
| holidays | tanggal, nama, jenis (nasional / cuti bersama / perusahaan) |
| attendance\_records | employee\_id, tanggal, clock\_in, clock\_out, lokasi, status, sumber |
| attendance\_corrections | record\_id, alasan, nilai usulan, status |
| leave\_types, leave\_policies, leave\_balances | aturan kuota, akrual, carry-over; saldo per karyawan per tahun |
| leave\_requests, approvals | jenis, rentang tanggal, jumlah hari, status, rantai persetujuan |
| overtime\_requests (P1) | tanggal, jam mulai/selesai, status, jam terhitung |
| payroll\_periods, salary\_components, employee\_salaries, payslips, payslip\_items (P1) | komponen, nilai, periode, status terkunci |
| reimbursements, documents (P1) | nominal, kategori, lampiran; jenis dokumen, URL storage |
| notifications | user\_id, jenis, payload, dibaca |
| audit\_logs | actor\_id, aksi, entitas, nilai\_lama, nilai\_baru, IP, timestamp |

**Konvensi data:** primary key UUID; waktu disimpan sebagai timestamptz (UTC); nilai uang sebagai integer Rupiah atau numeric, tidak pernah float; soft delete untuk data karyawan; indeks pada employee\_id + tanggal untuk absensi; kolom company\_id pada semua tabel utama.

## 11. Desain API

Konvensi: REST, prefix `/api/v1`, JSON, validasi input dengan Zod, pagination, format error seragam (kode, pesan, detail field), dan idempotency key untuk aksi kritis seperti finalisasi payroll.

| Method | Endpoint | Fungsi | Peran |
| --- | --- | --- | --- |
| POST | /auth/login | Login, menerbitkan token | Publik |
| POST | /auth/refresh | Rotasi refresh token | Terautentikasi |
| GET | /employees | Daftar karyawan (filter, pagination) | HR, Manajer (tim) |
| POST | /employees | Tambah karyawan | HR |
| PATCH | /employees/:id | Ubah data karyawan | HR |
| POST | /attendance/clock-in | Clock in | Karyawan |
| POST | /attendance/clock-out | Clock out | Karyawan |
| GET | /attendance/me?month=YYYY-MM | Rekap absensi pribadi | Karyawan |
| POST | /attendance/corrections | Ajukan koreksi absensi | Karyawan |
| GET | /leave-balances/me | Saldo cuti | Karyawan |
| POST | /leave-requests | Ajukan cuti | Karyawan |
| POST | /leave-requests/:id/approve | Setujui / tolak cuti | Manajer, HR |
| GET | /reports/attendance | Laporan absensi | HR |
| POST | /payroll/periods/:id/run | Jalankan draft payroll (P1) | HR, Finance |
| GET | /payslips/me | Daftar slip gaji pribadi (P1) | Karyawan |

## 12. Keamanan dan Kepatuhan

- **Pelindungan data pribadi:** patuhi UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi — dasar pemrosesan dan persetujuan, hak subjek data (akses, koreksi, penghapusan), kebijakan retensi, dan prosedur notifikasi insiden.
- **Data sensitif:** NIK, NPWP, rekening, dan gaji dienkripsi di level kolom (mis. AES-256-GCM, kunci di secret manager) dan di-mask di UI.
- **Otorisasi berlapis:** RBAC ditambah pembatasan data (row-level scoping) — manajer hanya melihat bawahannya, karyawan hanya melihat datanya sendiri.
- **Audit:** log tidak dapat diubah untuk perubahan data sensitif, approval, dan seluruh aktivitas payroll.
- **Perlindungan aplikasi:** rate limiting dan lockout login, CSRF protection, Content Security Policy, CORS ketat, query terparameterisasi lewat ORM, header keamanan (helmet), dependency scanning.
- **Aturan ketenagakerjaan dan pajak:** ketentuan cuti, lembur, BPJS, PPh 21, dan THR tidak boleh di-hardcode; simpan sebagai konfigurasi bertanggal efektif dan divalidasi oleh konsultan HR/pajak sebelum rilis Fase 2.
- **Retensi:** kebijakan penyimpanan dan anonimisasi data karyawan yang sudah keluar sesuai ketentuan perusahaan dan hukum.
- **Pengujian keamanan:** penetration test sebelum go-live produksi.

## 13. Rencana Rilis dan Milestone

Asumsi tim: 2 frontend, 2 backend, 1 product/designer, 1 QA. Estimasi kasar, perlu divalidasi setelah discovery.

| Milestone | Durasi | Output |
| --- | --- | --- |
| M0 — Discovery dan desain | 2 minggu | Wawancara HR, alur final, wireframe dan UI kit, keputusan teknis |
| M1 — Fondasi | 4 minggu | Monorepo, CI/CD, auth, RBAC, Core HR, import karyawan, audit log |
| M2 — Absensi dan Cuti | 4 minggu | Clock in/out, jadwal, koreksi, kebijakan cuti, approval, notifikasi |
| M3 — Hardening dan UAT | 3 minggu | Dashboard, laporan, uji performa dan keamanan, pilot di satu departemen |
| **MVP go-live** | **± minggu ke-13** | Rilis produksi bertahap |
| M4 — Lembur dan Payroll | 6 minggu | Komponen gaji, BPJS, PPh 21, slip gaji, ekspor bank; paralel run 1–2 siklus |
| M5 — Reimbursement dan Dokumen | 4 minggu | Reimbursement, dokumen karyawan, laporan lanjutan |

## 14. Risiko dan Mitigasi

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Kompleksitas payroll dan pajak | Salah hitung, risiko hukum | Konsultan pajak/HR, tarif configurable, uji dengan data nyata, jalankan paralel dengan proses lama 1–2 siklus |
| Batas serverless untuk job berat | Timeout saat payroll/rekap | Proses per batch via queue, Vercel Cron, opsi pindah ke container |
| Kecurangan absensi (titip absen, fake GPS) | Data kehadiran tidak valid | Waktu server, selfie (P1), flag anomali, audit; kebijakan perusahaan yang jelas |
| Kebocoran data sensitif | Pelanggaran UU PDP, reputasi | Enkripsi kolom, RBAC ketat, audit log, pentest, akses minimum |
| Adopsi rendah | Produk tidak dipakai | UX sederhana mobile-first, pelatihan singkat, import massal, pilot bertahap |
| Latensi dan cold start | Pengalaman lambat | Region Singapura, connection pooling, caching, optimasi query |
| Perubahan regulasi | Aturan tidak lagi sesuai | Aturan sebagai konfigurasi bertanggal efektif, review regulasi berkala |

## 15. Asumsi, Dependensi, dan Pertanyaan Terbuka

**Asumsi**

- Satu perusahaan per deployment pada MVP (kolom company\_id disiapkan untuk multi-company).
- Pengguna mengakses lewat browser modern di ponsel atau desktop dengan koneksi internet.
- Kebijakan cuti, jam kerja, dan alur approval disediakan oleh HR pada fase discovery.

**Dependensi**

- Domain dan sertifikat TLS, akun Vercel, penyedia PostgreSQL, layanan email, object storage.
- Layanan error monitoring dan akun CI.
- Konsultan HR/pajak untuk validasi aturan payroll.

**Pertanyaan terbuka**

1. Berapa jumlah karyawan target dan berapa lokasi kerja (menentukan desain geofence dan zona waktu)?
2. Apakah perlu multi-perusahaan/anak usaha dalam satu aplikasi sejak awal?
3. Apakah absensi cukup lewat web, atau wajib selfie dan integrasi mesin fingerprint?
4. Siapa yang memegang keputusan akhir kebijakan cuti dan lembur?
5. Apakah payroll perlu terhubung dengan bank tertentu (format file transfer)?
6. Apakah ada kebutuhan hosting data di wilayah tertentu (data residency)?

## 16. Kriteria Penerimaan MVP

- [ ] Seluruh kebutuhan P0 lolos UAT bersama HR dan minimal satu departemen pilot.
- [ ] Tidak ada bug severity tinggi/kritis yang terbuka.
- [ ] Uji beban untuk 200 pengguna bersamaan memenuhi target performa.
- [ ] Penetration test selesai dan temuan kritis ditutup.
- [ ] Backup otomatis aktif dan uji restore berhasil.
- [ ] Monitoring, alert, dan runbook insiden tersedia.
- [ ] Dokumentasi pengguna (HR, manajer, karyawan) dan dokumentasi teknis selesai.
