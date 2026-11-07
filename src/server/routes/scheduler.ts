import { Hono } from 'hono';
import { redis } from '@devvit/web/server';
import type { TaskResponse } from '@devvit/web/server';
import { todayUtc } from '../core/game-store.ts';
import { createDailyPost } from '../core/post';

export const scheduler = new Hono();

/** Cron (devvit.json): one new post per day at 00:00 UTC. Idempotent per date. */
scheduler.post('/daily-post', async (c) => {
  const date = todayUtc();
  const key = `dailypost:${date}`;
  try {
    if ((await redis.incrBy(key, 1)) > 1) return c.json<TaskResponse>({}, 200);
    await redis.expire(key, 60 * 60 * 48);
    const post = await createDailyPost(date);
    console.log(`daily post ${date}: ${post.id}`);
  } catch (err) {
    await redis.del(key); // allow a retry
    console.error('daily post failed', err);
  }
  return c.json<TaskResponse>({}, 200);
});
