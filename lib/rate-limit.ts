// Lightweight in-memory rate limiter for the subscribe endpoint.
//
// Best-effort only: state lives in a single serverless instance's memory,
// so it resets on cold start and isn't shared across concurrent instances.
// Good enough to blunt casual scripted abuse; swap for Vercel KV / Upstash
// if this ever needs to be airtight.

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS = 5;

const hits = new Map<string, number[]>();

export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const timestamps = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  timestamps.push(now);
  hits.set(key, timestamps);

  // Prevent unbounded growth if this instance stays warm a long time.
  if (hits.size > 5000) {
    hits.clear();
  }

  return timestamps.length > MAX_REQUESTS;
}
