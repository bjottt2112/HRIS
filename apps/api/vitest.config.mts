import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Nilai aman untuk unit test: tidak ada koneksi database nyata yang dipakai
    // karena modul Prisma selalu di-mock di dalam test.
    env: {
      DATABASE_URL: "postgresql://hris:hris@127.0.0.1:5432/hris_test",
      JWT_SECRET: "test-secret-untuk-unit-test-saja",
      APP_URL: "http://localhost:3000",
      UPLOAD_DIR: "tests/.tmp-uploads",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "src/lib/hr.ts",
        "src/lib/geo.ts",
        "src/lib/leave-policy.ts",
        "src/lib/password-reset.ts",
        "src/lib/spreadsheet.ts",
        "src/lib/uploads.ts",
        "src/lib/rate-limit.ts",
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});
