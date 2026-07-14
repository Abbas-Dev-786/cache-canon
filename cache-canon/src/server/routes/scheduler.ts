import { Hono } from 'hono';
import { redis } from '@devvit/web/server';
import { getJSON, setJSON } from '../helpers/redis-helpers';
import { keys } from '../helpers/keys';
import type { HuntConfig } from '../../shared/types';

export const scheduler = new Hono();

scheduler.post('/daily-hunt-rotation', async (c) => {
  await c.req.json();
  const today = new Date().toISOString().slice(0, 10);

  // Check if already set for today
  const existingPostId = await redis.get(keys.dailyPost(today));
  if (existingPostId) {
    console.log(`Daily hunt already set for ${today}`);
    return c.json({ status: 'ok' });
  }

  // Create a brand new config dynamically for today
  const nextPostId = `daily-${today}`;

  const cacheCells: number[] = [];
  while (cacheCells.length < 3) {
    const r = Math.floor(Math.random() * 48);
    if (!cacheCells.includes(r)) cacheCells.push(r);
  }

  const config: HuntConfig = {
    postId: nextPostId,
    creatorId: 'system',
    creatorUsername: 'Daily Challenge',
    rows: 8,
    cols: 6,
    cacheCells,
    title: `Daily Hunt - ${today}`,
    status: 'active',
    createdAt: Date.now(),
    isDaily: true,
    dailyDate: today,
  };

  await setJSON(keys.huntConfig(nextPostId), config);

  // Set today's daily post
  await redis.set(keys.dailyPost(today), nextPostId);

  console.log(`Daily hunt dynamically generated for ${today}: ${nextPostId}`);
  return c.json({ status: 'ok' });
});
