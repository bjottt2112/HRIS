import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLoginFailures,
  loginThrottle,
  recordLoginFailure,
} from "../src/lib/rate-limit";

beforeEach(() => {
  vi.useRealTimers();
});

describe("loginThrottle", () => {
  it("tidak memblokir sebelum batas tercapai", () => {
    const key = `test-${Math.random()}`;
    expect(loginThrottle(key).blocked).toBe(false);

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      recordLoginFailure(key);
      expect(loginThrottle(key).blocked).toBe(false);
    }
  });

  it("memblokir setelah 5 kegagalan dan memberi Retry-After", () => {
    const key = `test-${Math.random()}`;
    for (let attempt = 0; attempt < 5; attempt += 1) recordLoginFailure(key);

    const throttle = loginThrottle(key);
    expect(throttle.blocked).toBe(true);
    expect(throttle.retryAfterSeconds).toBeGreaterThan(0);
    expect(throttle.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
  });

  it("menghormati batas kustom (mis. forgot-password = 3)", () => {
    const key = `test-${Math.random()}`;
    for (let attempt = 0; attempt < 3; attempt += 1) recordLoginFailure(key);

    expect(loginThrottle(key, 3).blocked).toBe(true);
    expect(loginThrottle(key, 4).blocked).toBe(false);
  });

  it("clearLoginFailures membuka blokir kembali", () => {
    const key = `test-${Math.random()}`;
    for (let attempt = 0; attempt < 5; attempt += 1) recordLoginFailure(key);
    expect(loginThrottle(key).blocked).toBe(true);

    clearLoginFailures(key);
    expect(loginThrottle(key).blocked).toBe(false);
  });

  it("membuka blokir setelah jendela waktu lewat", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T00:00:00.000Z"));

    const key = `test-${Math.random()}`;
    for (let attempt = 0; attempt < 5; attempt += 1) recordLoginFailure(key);
    expect(loginThrottle(key).blocked).toBe(true);

    vi.setSystemTime(new Date("2026-11-01T00:16:00.000Z"));
    expect(loginThrottle(key).blocked).toBe(false);
  });
});
