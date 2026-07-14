## Phase 6 — Daily Hunt & Engagement Loops

**Goal:** One shared board per day. Streak tracking. 7+ seeded boards ready for hackathon judges.

**Estimated time:** 3 hours

### Tasks

**6.1 — `GET /api/daily-hunt` handler**

Add to `src/server/routes/api.ts`:

```ts
api.get('/daily-hunt', async (c) => {
  const today = new Date().toISOString().slice(0, 10);  // YYYY-MM-DD UTC
  const postId = await redis.get(keys.dailyPost(today));

  if (!postId) {
    // Fallback: return most recent seeded daily board or error
    return c.json({ error: 'No daily hunt available today' }, 404);
  }

  // Reuse the hunt-view endpoint logic
  const { userId } = context;
  const config = await getJSON<HuntConfig>(keys.huntConfig(postId));
  if (!config) return c.json({ error: 'Daily hunt config not found' }, 404);

  const stats = await redis.hGetAll(keys.huntStats(postId));
  const plays = parseInt(stats?.plays ?? '0');
  const completions = parseInt(stats?.completions ?? '0');
  const completionRate = plays > 0 ? Math.round((completions / plays) * 100) : 0;

  const run = userId
    ? (await getJSON<RunState>(keys.huntRun(postId, userId)) ?? emptyRun(userId))
    : emptyRun('');

  const topMembers = await redis.zRange(keys.huntLeaderboard(postId), 0, 9, { by: 'rank' });
  const leaderboard = await buildLeaderboardEntries(postId, topMembers);

  return c.json<HuntView>({
    postId,
    title: config.title,
    creatorUsername: config.creatorUsername,
    stats: { plays, completions, difficultyLabel: getDifficultyLabel(completionRate, plays) },
    run: toPublicRun(run),
    leaderboard,
    isDaily: true,
    dailyDate: today,
  });
});
```

**6.2 — Scheduler job — daily rotation**

In Devvit Web, scheduler tasks are:
1. **Declared in `devvit.json`** under `scheduler.tasks` with an `endpoint` and optional `cron`
2. **Handled as regular HTTP POST endpoints** on the server

The `devvit.json` already declares this from Phase 0:

```json
"scheduler": {
  "tasks": {
    "daily-hunt-rotation": {
      "endpoint": "/internal/scheduler/daily-hunt-rotation",
      "cron": "0 0 * * *"
    }
  }
}
```

Create `src/server/routes/scheduler.ts`:

```ts
import { Hono } from 'hono';
import { redis } from '@devvit/web/server';
import type { TaskRequest, TaskResponse } from '@devvit/web/server';
import { getJSON, setJSON } from '../helpers/redis-helpers';
import { keys } from '../helpers/keys';
import type { HuntConfig } from '../../shared/types';

export const scheduler = new Hono();

scheduler.post('/daily-hunt-rotation', async (c) => {
  const _input = await c.req.json<TaskRequest>();
  const today = new Date().toISOString().slice(0, 10);

  // Check if already set for today
  const existingPostId = await redis.get(keys.dailyPost(today));
  if (existingPostId) {
    console.log(`Daily hunt already set for ${today}`);
    return c.json<TaskResponse>({ status: 'ok' });
  }

  // Pop the next pre-seeded postId from the queue
  // NOTE: Devvit Redis does NOT support Lists (lPop/lPush).
  // Use a sorted set with timestamp scores as a FIFO queue instead.
  const queueItems = await redis.zRange(keys.dailyQueue(), 0, 0, { by: 'rank' });

  if (queueItems.length === 0) {
    console.error('Daily Hunt queue is empty!');
    return c.json<TaskResponse>({ status: 'ok' });
  }

  const nextPostId = queueItems[0].member;
  // Remove it from the queue
  await redis.zRem(keys.dailyQueue(), [nextPostId]);

  // Set today's daily post
  await redis.set(keys.dailyPost(today), nextPostId);

  // Mark the hunt as the daily for today
  const config = await getJSON<HuntConfig>(keys.huntConfig(nextPostId));
  if (config) {
    config.isDaily = true;
    config.dailyDate = today;
    await setJSON(keys.huntConfig(nextPostId), config);
  }

  console.log(`Daily hunt set for ${today}: ${nextPostId}`);
  return c.json<TaskResponse>({ status: 'ok' });
});
```

> **Critical:** Devvit Redis does **NOT support Lists** (`lPop`, `lPush`, `rPop`, `rPush`). Supported types are: strings, hashes, sorted sets, numbers, bitfields, and transactions. Use sorted sets with timestamp scores for FIFO queue behavior.

**6.3 — Streak tracking (in fireAtCell completion path)**

Add this function and call it from the `/api/fire-at-cell` handler when `completed === true && config.isDaily === true`:

```ts
import type { DailyStreak } from '../../shared/types';

async function updateDailyStreak(userId: string): Promise<DailyStreak | undefined> {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  const streak = await getJSON<DailyStreak>(keys.dailyStreak(userId)) ?? {
    lastCompletedDate: '', currentStreak: 0, bestStreak: 0,
  };

  if (streak.lastCompletedDate === today) return streak;  // Already counted today

  const newCurrent = streak.lastCompletedDate === yesterday
    ? streak.currentStreak + 1
    : 1;  // Streak broken

  const updated: DailyStreak = {
    lastCompletedDate: today,
    currentStreak: newCurrent,
    bestStreak: Math.max(newCurrent, streak.bestStreak),
  };

  await setJSON(keys.dailyStreak(userId), updated);
  return updated;
}
```

**6.4 — `GET /api/daily-streak` endpoint**

```ts
api.get('/daily-streak', async (c) => {
  const { userId } = context;
  if (!userId) return c.json({ streak: null });

  const streak = await getJSON<DailyStreak>(keys.dailyStreak(userId));
  return c.json({ streak });
});
```

**6.5 — Daily Hunt UI (DOM overlay)**

```ts
// In game.ts
async function showDailyView() {
  const data = await fetch('/api/daily-hunt').then(r => r.json());
  const streakData = await fetch('/api/daily-streak').then(r => r.json());

  if (data.error) {
    // Show "No daily hunt available" message
    return;
  }

  const panel = document.getElementById('daily-panel')!;
  const streak = streakData.streak;

  panel.innerHTML = `
    <div class="daily-header">
      <h2>Daily Hunt</h2>
      ${streak && streak.currentStreak > 1
        ? `<span class="streak-badge">🔥 ${streak.currentStreak} day streak</span>`
        : ''}
      <span class="daily-date">${data.dailyDate}</span>
    </div>
    ${data.run.completed
      ? `<div class="daily-completed">
          <p>✅ You completed today's hunt!</p>
          <p>${data.run.shots} shots · ${data.run.misses} misses</p>
        </div>`
      : '<div id="daily-game-container"></div>'}
  `;
  panel.classList.remove('hidden');

  if (!data.run.completed) {
    // Mount HuntScene with daily hunt data
  }
}
```

**6.6 — Seeding boards for the hackathon**

Pre-create at least 7 `HuntConfig` entries. Use the `onAppInstall` trigger or a manual admin action to seed:

```ts
// In src/server/routes/triggers.ts — run on app install
import { Hono } from 'hono';
import { redis } from '@devvit/web/server';
import type { TriggerRequest, TriggerResponse } from '@devvit/web/server';
import { setJSON } from '../helpers/redis-helpers';
import { keys } from '../helpers/keys';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  const _input = await c.req.json<TriggerRequest>();

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
    const seedId = `seed-${i}`;
    const config = {
      postId: seedId,
      creatorId: 'system',
      creatorUsername: 'Cache Hunt',
      rows: 8 as const,
      cols: 6 as const,
      cacheCells: SEEDED_CONFIGS[i].cacheCells,
      title: SEEDED_CONFIGS[i].title,
      status: 'active' as const,
      createdAt: Date.now(),
      isDaily: false,
      dailyDate: undefined,
    };
    await setJSON(keys.huntConfig(seedId), config);

    // Add to daily queue as sorted set (score = index for ordering)
    await redis.zAdd(keys.dailyQueue(), { member: seedId, score: i });
  }

  console.log(`Seeded ${SEEDED_CONFIGS.length} daily hunt configs`);
  return c.json<TriggerResponse>({ status: 'ok' });
});
```

**Exit criteria:** `GET /api/daily-hunt` returns the correct board for today's date. Streak increments on consecutive days and resets after a missed day. 7 seeded boards are playable. Daily leaderboard is separate from per-board leaderboard. No Redis List operations used — sorted sets throughout.
