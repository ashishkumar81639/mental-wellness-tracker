// sprint: in-memory rate limiter keyed by IP. Move to Redis past one node.
// Sliding-window per IP per endpoint. Shared across routes in the same process.

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const store = new Map<string, RateLimitEntry>();

// sprint: no eviction. Memory grows unbounded with unique IPs. Add TTL-cleanup or LRU cap.
const DEFAULTS: Record<string, RateLimitConfig> = {
  "auth:login": { maxRequests: 10, windowMs: 60_000 }, // 10/min
  "auth:register": { maxRequests: 5, windowMs: 60_000 }, // 5/min
  "check-in": { maxRequests: 5, windowMs: 60_000 }, // 5/min
  "chat": { maxRequests: 15, windowMs: 60_000 }, // 15/min
  "reframe": { maxRequests: 10, windowMs: 60_000 }, // 10/min
};

function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "127.0.0.1"
  );
}

export function checkRateLimit(
  req: Request,
  endpoint: string
): { allowed: true } | { allowed: false; retryAfter: number } {
  const config = DEFAULTS[endpoint];
  if (!config) return { allowed: true }; // unregistered endpoint = no limit

  const ip = getClientIp(req);
  const key = `${endpoint}:${ip}`;
  const now = Date.now();

  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true };
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count++;
  return { allowed: true };
}
