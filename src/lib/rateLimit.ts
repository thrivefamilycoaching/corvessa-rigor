const stores = new Map<string, Map<string, number[]>>();

export function checkRateLimit(
  storeName: string,
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds?: number } {
  if (!stores.has(storeName)) {
    stores.set(storeName, new Map());
  }
  const store = stores.get(storeName)!;
  const now = Date.now();
  const windowStart = now - windowMs;

  const timestamps = (store.get(key) || []).filter((t) => t > windowStart);
  store.set(key, timestamps);

  if (timestamps.length >= maxRequests) {
    const oldest = timestamps[0];
    const retryAfterSeconds = Math.ceil((oldest + windowMs - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  timestamps.push(now);
  return { allowed: true };
}

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return headers.get("x-real-ip") || "unknown";
}
