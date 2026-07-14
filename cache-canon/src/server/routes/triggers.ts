import { Hono } from 'hono';
import { redis } from '@devvit/web/server';
import { setJSON } from '../helpers/redis-helpers';
import { keys } from '../helpers/keys';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  await c.req.json();

  const SEEDED_CONFIGS = [
    { title: 'Starter Cache',   cacheCells: [7, 23, 38] },
    { title: 'Cross Hatched',   cacheCells: [0, 23, 47] },
    { title: 'Corner Clash',    cacheCells: [5, 42, 29] },
    { title: 'Middle Madness',  cacheCells: [20, 21, 27] },
    { title: 'Full Spread',     cacheCells: [0, 25, 47] },
    { title: 'Edge Walker',     cacheCells: [3, 18, 44] },
    { title: 'The Decoy',       cacheCells: [11, 12, 36] },
  ];

  for (let i = 0; i < SEEDED_CONFIGS.length; i++) {
    const seed = SEEDED_CONFIGS[i];
    if (!seed) continue;
    
    const seedId = `seed-${i}`;
    const config = {
      postId: seedId,
      creatorId: 'system',
      creatorUsername: 'Cache Hunt',
      rows: 8 as const,
      cols: 6 as const,
      cacheCells: seed.cacheCells,
      title: seed.title,
      status: 'active' as const,
      createdAt: Date.now(),
      isDaily: false,
      dailyDate: undefined,
    };
    await setJSON(keys.huntConfig(seedId), config);
  }

  console.log(`Seeded ${SEEDED_CONFIGS.length} daily hunt configs`);
  return c.json({ status: 'ok' });
});
