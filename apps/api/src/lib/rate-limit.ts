type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

const MAX_BUCKETS = 10_000;

function pruneExpired(now: number): void {
  if (buckets.size < MAX_BUCKETS) return;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Rate limit in-memory sederhana untuk percobaan login.
 * Cukup untuk deployment MVP satu instance; jika API di-scale horizontal,
 * ganti dengan store bersama (mis. Redis).
 */
export function loginThrottle(key: string, maxFailures = 5, windowMs = 15 * 60_000) {
  const now = Date.now();
  pruneExpired(now);

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 0, resetAt: now + windowMs });
    return { blocked: false, retryAfterSeconds: 0 };
  }

  if (bucket.count >= maxFailures) {
    return {
      blocked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  return { blocked: false, retryAfterSeconds: 0 };
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    return;
  }

  bucket.count += 1;
}

export function clearLoginFailures(key: string): void {
  buckets.delete(key);
}
