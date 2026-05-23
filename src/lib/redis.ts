// src/lib/redis.ts
import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedisClient() {
  const client = new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    lazyConnect: false,
  });

  client.on("error", (err) => {
    console.error("Redis error:", err);
  });

  return client;
}

export const redis = globalForRedis.redis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

// Distributed lock using SET NX PX
export async function acquireLock(
  key: string,
  ttlMs: number = 5000
): Promise<string | null> {
  const token = crypto.randomUUID();
  // SET key token NX PX ttlMs — only sets if key does not exist
  const result = await redis.set(`lock:${key}`, token, "NX", "PX", ttlMs);
  return result === "OK" ? token : null;
}

export async function releaseLock(key: string, token: string): Promise<void> {
  // Lua script: only delete if the token matches (atomic)
  const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;
  await redis.eval(script, 1, `lock:${key}`, token);
}
