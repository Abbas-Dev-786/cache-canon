import { redis } from '@devvit/web/server';

export async function getJSON<T>(key: string): Promise<T | null> {
  const val = await redis.get(key);
  return val ? JSON.parse(val) : null;
}

export async function setJSON<T>(key: string, value: T, ex?: number): Promise<void> {
  await redis.set(key, JSON.stringify(value));
  if (ex) {
    await redis.expire(key, ex);
  }
}
