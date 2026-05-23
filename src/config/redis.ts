import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

// ── In-memory fallback for when Redis is unavailable ─────────────────────────
const memoryStore = new Map<string, { value: string; expiresAt: number }>();

function memSet(key: string, value: string, ttlSeconds: number) {
  memoryStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

function memGet(key: string): string | null {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

function memDel(key: string) {
  memoryStore.delete(key);
}

function memExpire(key: string, ttlSeconds: number) {
  const entry = memoryStore.get(key);
  if (entry) {
    entry.expiresAt = Date.now() + ttlSeconds * 1000;
  }
}

// ── Redis client (optional) ───────────────────────────────────────────────────
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

let redisAvailable = false;

export const redis = new Redis(redisUrl, {
  lazyConnect: true,
  retryStrategy: (times) => {
    if (times > 2) return null; // stop retrying after 2 attempts
    return Math.min(times * 200, 1000);
  },
  enableOfflineQueue: false,
});

redis.on("connect", () => {
  redisAvailable = true;
  console.log("✅ Redis connected");
});

redis.on("error", () => {
  redisAvailable = false;
}); // suppress noise

// ── Online status helpers — use Redis if available, memory otherwise ──────────

export const setUserOnline = async (userId: string): Promise<void> => {
  if (redisAvailable) {
    await redis.set(`online:${userId}`, "1", "EX", 300).catch(() => {});
  } else {
    memSet(`online:${userId}`, "1", 300);
  }
};

export const setUserOffline = async (userId: string): Promise<void> => {
  if (redisAvailable) {
    await redis.del(`online:${userId}`).catch(() => {});
  } else {
    memDel(`online:${userId}`);
  }
};

export const isUserOnline = async (userId: string): Promise<boolean> => {
  if (redisAvailable) {
    try {
      const val = await redis.get(`online:${userId}`);
      return val === "1";
    } catch {
      return memGet(`online:${userId}`) === "1";
    }
  }
  return memGet(`online:${userId}`) === "1";
};

export const refreshOnlineStatus = (userId: string): void => {
  if (redisAvailable) {
    redis.expire(`online:${userId}`, 300).catch(() => {});
  } else {
    memExpire(`online:${userId}`, 300);
  }
};
