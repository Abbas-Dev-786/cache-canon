## Phase 3 — Server Authority & Redis Data Layer

**Goal:** Every shot validated server-side via Hono `/api/` endpoints. Cache positions never leave the server. Run state persists across page refreshes.

**Estimated time:** 5 hours

### Tasks

**3.1 — `src/server/helpers/redis-helpers.ts` — typed Redis helpers**

Use the **named `redis` import** from `@devvit/web/server` — NOT `@devvit/public-api` or `context.redis`:

```ts
import { redis } from '@devvit/web/server';

export async function getJSON<T>(key: string): Promise<T | null> {
  const val = await redis.get(key);
  return val ? JSON.parse(val) : null;
}

export async function setJSON<T>(key: string, value: T, ex?: number): Promise<void> {
  if (ex) {
    await redis.set(key, JSON.stringify(value), { EX: ex });
  } else {
    await redis.set(key, JSON.stringify(value));
  }
}
```

**3.2 — `src/server/helpers/clue.ts` — server-side clue calculation**

```ts
import { CLUE_BANDS, BOARD } from '../../shared/constants';
import type { ClueData } from '../../shared/types';

export function calcClue(fired: number, remainingCaches: number[]): ClueData {
  const fRow = Math.floor(fired / BOARD.COLS);
  const fCol = fired % BOARD.COLS;

  const dist = Math.min(...remainingCaches.map(c => {
    const cRow = Math.floor(c / BOARD.COLS);
    const cCol = c % BOARD.COLS;
    return Math.abs(cRow - fRow) + Math.abs(cCol - fCol);
  }));

  const band = CLUE_BANDS.find(b => dist >= b.min && dist <= b.max)!;
  return { signal: band.signal as ClueData['signal'], label: band.label };
}
```

**3.3 — `src/server/helpers/ranking.ts` — rank score encoding**

```ts
import { RANK } from '../../shared/constants';

export function encodeRankScore(shots: number, misses: number, elapsedMs: number): number {
  return shots  * RANK.SHOTS_WEIGHT
       + misses * RANK.MISSES_WEIGHT
       + Math.min(elapsedMs, RANK.MAX_TIME_MS);
}
// Lower score = better rank. Store in Redis sorted set ascending.
```

**3.4 — `src/server/routes/api.ts` — the API routes**

All client-facing routes live under `/api/`. This is the Devvit Web pattern — the client calls `fetch('/api/...')` and Devvit handles authentication automatically.

```ts
import { Hono } from 'hono';
import { redis, context } from '@devvit/web/server';
import { getJSON, setJSON } from '../helpers/redis-helpers';
import { keys } from '../helpers/keys';
import { calcClue } from '../helpers/clue';
import { encodeRankScore } from '../helpers/ranking';
import type {
  HuntConfig, RunState, ShotResult, PublicRunState,
  ClueData, HuntView, LeaderboardEntry
} from '../../shared/types';

export const api = new Hono();

// ============================================================
// POST /api/fire-at-cell — the critical path
// ============================================================
api.post('/fire-at-cell', async (c) => {
  const { userId, postId: ctxPostId } = context;
  const { postId, cellIndex, requestId } = await c.req.json<{
    postId: string; cellIndex: number; requestId?: string;
  }>();

  // 1. Auth check — logged-out users can't fire
  if (!userId) {
    return c.json({ error: 'Login required to play' }, 401);
  }

  // 2. Validate cellIndex range
  if (cellIndex < 0 || cellIndex > 47 || !Number.isInteger(cellIndex)) {
    return c.json({ error: 'Invalid cell' }, 400);
  }

  const config = await getJSON<HuntConfig>(keys.huntConfig(postId));
  if (!config || config.status !== 'active') {
    return c.json({ error: 'Hunt not active' }, 404);
  }

  // 3. Load or create run state using Redis transaction for atomicity
  const runKey = keys.huntRun(postId, userId);
  let run = await getJSON<RunState>(runKey) ?? {
    userId, firedCells: [], foundCells: [], shots: 0, misses: 0, startedAt: 0,
  };

  // 4. Idempotency: if same requestId already processed, return stored result
  if (requestId && run.lastRequestId === requestId) {
    return c.json(buildShotResultFromRun(run, cellIndex, config));
  }

  // 5. Reject duplicate cell
  if (run.firedCells.includes(cellIndex)) {
    return c.json<ShotResult>({
      cellIndex, outcome: 'miss', run: toPublicRun(run), duplicate: true,
    });
  }

  // 6. First shot: record start time, increment play count
  const now = Date.now();
  if (run.firedCells.length === 0) {
    run.startedAt = now;
    await redis.hIncrBy(keys.huntStats(postId), 'plays', 1);
  }

  // 7. Resolve shot — server compares against private cacheCells
  const isHit = config.cacheCells.includes(cellIndex);
  run.firedCells.push(cellIndex);
  run.shots++;

  let clue: ClueData | undefined;

  if (isHit) {
    run.foundCells.push(cellIndex);
  } else {
    run.misses++;
    const remaining = config.cacheCells.filter(c => !run.foundCells.includes(c));
    clue = calcClue(cellIndex, remaining);
  }

  // 8. Check completion
  let completed = false;
  let bestRank: number | undefined;

  if (run.foundCells.length === config.cacheCells.length) {
    completed = true;
    run.completedAt = now;
    run.elapsedMs = now - run.startedAt;

    // Update completion stats
    await redis.hIncrBy(keys.huntStats(postId), 'completions', 1);

    // Upsert personal best
    const existing = await getJSON<RunState>(keys.huntResult(postId, userId));
    const newScore = encodeRankScore(run.shots, run.misses, run.elapsedMs);
    const isNewBest = !existing || newScore < encodeRankScore(
      existing.shots, existing.misses, existing.elapsedMs!
    );

    if (isNewBest) {
      await setJSON(keys.huntResult(postId, userId), run);
      await redis.zAdd(keys.huntLeaderboard(postId), {
        member: userId, score: newScore,
      });
    }

    // Get current rank
    const rank = await redis.zRank(keys.huntLeaderboard(postId), userId);
    bestRank = rank !== null ? rank + 1 : undefined;
  }

  // 9. Persist run state with idempotency key
  run.lastRequestId = requestId;
  await setJSON(runKey, run);

  // CRITICAL: response NEVER includes config.cacheCells or any unhit cache position
  return c.json<ShotResult>({
    cellIndex,
    outcome: isHit ? 'hit' : 'miss',
    clue,
    run: toPublicRun(run),
    completed,
    bestRank,
  });
});

// ============================================================
// GET /api/hunt-view — load hunt data for a post
// ============================================================
api.get('/hunt-view', async (c) => {
  const postId = c.req.query('postId');
  if (!postId) return c.json({ error: 'postId required' }, 400);

  const { userId } = context;
  const config = await getJSON<HuntConfig>(keys.huntConfig(postId));
  if (!config) return c.json({ error: 'Hunt not found' }, 404);

  const stats = await redis.hGetAll(keys.huntStats(postId));
  const plays = parseInt(stats?.plays ?? '0');
  const completions = parseInt(stats?.completions ?? '0');
  const completionRate = plays > 0 ? Math.round((completions / plays) * 100) : 0;

  const run = userId
    ? (await getJSON<RunState>(keys.huntRun(postId, userId)) ?? emptyRun(userId))
    : emptyRun('');

  // Fetch top 10 leaderboard entries
  const topMembers = await redis.zRange(
    keys.huntLeaderboard(postId), 0, 9, { by: 'rank' }
  );
  const leaderboard = await buildLeaderboardEntries(postId, topMembers);

  // NEVER include config.cacheCells in the response
  return c.json<HuntView>({
    postId,
    title: config.title,
    creatorUsername: config.creatorUsername,
    stats: { plays, completions, difficultyLabel: getDifficultyLabel(completionRate, plays) },
    run: toPublicRun(run),
    leaderboard,
    isDaily: config.isDaily,
    dailyDate: config.dailyDate,
  });
});

// ============================================================
// Helper functions
// ============================================================

function toPublicRun(run: RunState): PublicRunState {
  return {
    shots: run.shots,
    misses: run.misses,
    foundCount: run.foundCells.length,
    firedCells: run.firedCells,
    completed: !!run.completedAt,
    elapsedMs: run.elapsedMs,
  };
}

function emptyRun(userId: string): RunState {
  return { userId, firedCells: [], foundCells: [], shots: 0, misses: 0, startedAt: 0 };
}

function getDifficultyLabel(completionRate: number, plays: number): string {
  if (plays < 10) return 'New hunt';
  if (completionRate >= 60) return 'Easy';
  if (completionRate >= 35) return 'Tricky';
  return 'Brutal';
}

function buildShotResultFromRun(run: RunState, cellIndex: number, config: HuntConfig): ShotResult {
  const isHit = run.foundCells.includes(cellIndex);
  return {
    cellIndex,
    outcome: isHit ? 'hit' : 'miss',
    run: toPublicRun(run),
    completed: !!run.completedAt,
  };
}

async function buildLeaderboardEntries(
  postId: string,
  members: Array<{ member: string; score: number }>
): Promise<LeaderboardEntry[]> {
  return members.map((m, i) => ({
    userId: m.member,
    username: undefined, // Resolve usernames in a follow-up if needed
    shots: Math.floor(m.score / 1_000_000_000),
    misses: Math.floor((m.score % 1_000_000_000) / 1_000_000),
    elapsedMs: m.score % 1_000_000,
    rank: i + 1,
  }));
}
```

**3.5 — Wire `api` routes into `src/server/index.ts`**

The scaffolded `src/server/index.ts` already mounts routes. Add the api routes:

```ts
// src/server/index.ts (extend existing)
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';
import { api } from './routes/api';
import { menu } from './routes/menu';
import { triggers } from './routes/triggers';
import { scheduler } from './routes/scheduler';

const app = new Hono();
const internal = new Hono();

internal.route('/menu', menu);
internal.route('/triggers', triggers);
internal.route('/scheduler', scheduler);

app.route('/api', api);
app.route('/internal', internal);

serve({
  fetch: app.fetch,
  createServer,
  port: getServerPort(),
});
```

**3.6 — Connect HuntScene to server**

Replace local `resolveShot` in HuntScene with a `fetch('/api/fire-at-cell')` call:

```ts
private async resolveShot(cellIndex: number) {
  this.setLoading(true);
  try {
    const result = await fetch('/api/fire-at-cell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postId: this.huntData.postId,
        cellIndex,
        requestId: crypto.randomUUID(),
      }),
    });
    const data = await result.json() as ShotResult;

    if (data.duplicate) {
      this.playDryFire();
      return;
    }

    // Update tile state from server result
    if (data.outcome === 'hit') {
      this.showHitEffect(cellIndex);
    } else {
      this.showMissEffect(cellIndex);
      if (data.clue) this.showClue(data.clue);
    }

    this.game.events.emit('shot-resolved', data.run);

    if (data.completed) {
      this.game.events.emit('run-complete', data);
    }
  } catch (err) {
    this.showRetryPrompt(cellIndex, err);
  } finally {
    this.setLoading(false);
  }
}
```

**3.7 — Security verification**

After wiring the server, open browser DevTools → Network tab. Fire a shot. Confirm:

- `POST /api/fire-at-cell` response body contains no cache cell indexes outside of confirmed hits
- `GET /api/hunt-view` response body contains no `cacheCells` field
- Typing `window.__huntConfig` or similar in console returns nothing useful

**Exit criteria:** Cache positions cannot be found in any network response. Firing the same cell twice returns a rejection. Refreshing the page restores run state. Clues are computed server-side and numerically correct.
