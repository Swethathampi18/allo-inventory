import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedisClient() {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL environment variable is not set");
  }
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    lazyConnect: true,
  });

  client.on("error", (err) => {
    console.error("Redis error:", err);
  });

  return client;
}

function getRedis(): Redis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = createRedisClient();
  }
  return globalForRedis.redis;
}

export const redis = new Proxy({} as Redis, {
  get(_target, prop) {
    const client = getRedis();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});

export async function acquireLock(
  key: string,
  ttlMs: number = 5000
): Promise<string | null> {
  const token = crypto.randomUUID();
  const client = getRedis();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (client as any).set(`lock:${key}`, token, "NX", "PX", ttlMs);
  return result === "OK" ? token : null;
}
export async function releaseLock(key: string, token: string): Promise<void> {
  const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;
  const client = getRedis();
  await client.eval(script, 1, `lock:${key}`, token);
}
