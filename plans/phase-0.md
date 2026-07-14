## Phase 0 — Project Scaffold & Shared Types

**Goal:** A running Devvit Web app with the right folder structure, all shared types defined, and zero placeholder debt.

**Estimated time:** 1 hour

### Tasks

**0.1 — Initialize the project**

The project has already been scaffolded using the Devvit Phaser template. The template uses Hono as the server framework and Vite with the `@devvit/start` plugin for builds.

```bash
# Already done — project is at cache-canon/
cd cache-canon
npm install phaser  # Already installed
```

**0.2 — Configure `devvit.json`**

Update the existing `devvit.json` to declare all required permissions, scheduler tasks, and entry points upfront. The configuration uses the [official devvit.json schema](https://developers.reddit.com/schema/config-file.v1.json).

> **Important:** Devvit Web uses `permissions` (not `capabilities`), `post.entrypoints` (not `customPost`), and `scheduler.tasks` (not `scheduledActions`). All endpoints must start with `/internal/`.

```json
{
  "$schema": "https://developers.reddit.com/schema/config-file.v1.json",
  "name": "cache-canon",
  "post": {
    "dir": "dist/client",
    "entrypoints": {
      "default": {
        "inline": true,
        "entry": "splash.html"
      },
      "game": {
        "entry": "game.html"
      }
    }
  },
  "server": {
    "dir": "dist/server",
    "entry": "index.cjs"
  },
  "permissions": {
    "redis": true,
    "realtime": true,
    "reddit": {
      "enable": true
    }
  },
  "menu": {
    "items": [
      {
        "label": "Create Cache Hunt",
        "description": "Create a new Cache Hunt post",
        "location": "subreddit",
        "forUserType": "moderator",
        "endpoint": "/internal/menu/create-hunt"
      }
    ]
  },
  "scheduler": {
    "tasks": {
      "daily-hunt-rotation": {
        "endpoint": "/internal/scheduler/daily-hunt-rotation",
        "cron": "0 0 * * *"
      }
    }
  },
  "triggers": {
    "onAppInstall": "/internal/triggers/on-app-install"
  },
  "scripts": {
    "build": "vite build",
    "dev": "vite build --watch"
  }
}
```

**0.3 — Define `src/shared/types.ts` (do this first, everything depends on it)**

```ts
export type HuntConfig = {
  postId: string;
  creatorId: string;
  creatorUsername?: string;
  rows: 8;
  cols: 6;
  cacheCells: number[];        // PRIVATE — never sent to client
  title: string;
  status: 'active' | 'closed';
  createdAt: number;
  isDaily: boolean;
  dailyDate?: string;          // YYYY-MM-DD
};

export type RunState = {
  userId: string;
  firedCells: number[];
  foundCells: number[];
  shots: number;
  misses: number;
  startedAt: number;
  completedAt?: number;
  elapsedMs?: number;
  lastRequestId?: string;      // idempotency key
};

export type ShotOutcome = 'hit' | 'miss';

export type ClueSignal = 'strong' | 'near' | 'weak' | 'distant';

export type ClueData = {
  signal: ClueSignal;
  label: string;
};

export type ShotResult = {
  cellIndex: number;
  outcome: ShotOutcome;
  clue?: ClueData;             // only on miss
  run: PublicRunState;         // safe subset of RunState
  completed?: boolean;
  bestRank?: number;
  duplicate?: boolean;
};

export type PublicRunState = {
  shots: number;
  misses: number;
  foundCount: number;
  firedCells: number[];        // only the calling user's own fired cells
  completed: boolean;
  elapsedMs?: number;
};

export type LeaderboardEntry = {
  userId: string;
  username?: string;
  shots: number;
  misses: number;
  elapsedMs: number;
  rank: number;
};

export type HuntView = {
  postId: string;
  title: string;
  creatorUsername?: string;
  stats: { plays: number; completions: number; difficultyLabel: string };
  run: PublicRunState;
  leaderboard: LeaderboardEntry[];
  isDaily: boolean;
  dailyDate?: string;
};

export type DailyStreak = {
  lastCompletedDate: string;   // YYYY-MM-DD
  currentStreak: number;
  bestStreak: number;
};

export type HuntDraft = {
  title: string;
  cacheCells: number[];
  creatorId: string;
  createdAt: number;
};
```

**0.4 — Define `src/shared/constants.ts`**

```ts
export const BOARD = { ROWS: 8, COLS: 6, TOTAL: 48, CACHE_COUNT: 3 } as const;
export const TITLE_MAX = 60;
export const RANK = {
  SHOTS_WEIGHT:  1_000_000_000,
  MISSES_WEIGHT: 1_000_000,
  MAX_TIME_MS:   999_999,
} as const;
export const CLUE_BANDS = [
  { min: 1, max: 2,        signal: 'strong',  label: 'Strong signal' },
  { min: 3, max: 4,        signal: 'near',    label: 'Near signal'   },
  { min: 5, max: 6,        signal: 'weak',    label: 'Weak signal'   },
  { min: 7, max: Infinity, signal: 'distant', label: 'Distant signal'},
] as const;
```

**0.5 — Establish folder structure**

Build on the existing Phaser template structure. Keep `src/client`, `src/server`, `src/shared` as-is and extend:

```
src/
  client/
    scenes/
      BootScene.ts
      HuntScene.ts
      ResultOverlay.ts
      EditorScene.ts
    components/
      ShotCounter.ts
      ClueToast.ts
      CreatorBanner.ts
      LeaderboardPanel.ts
      StreakBadge.ts
    splash.html               ← inline launch screen entry
    splash.ts
    splash.css
    game.html                 ← full game entry
    game.ts
    game.css
  server/
    index.ts                  ← Hono app (already scaffolded)
    routes/
      api.ts                  ← /api/* routes (client-facing)
      menu.ts                 ← /internal/menu/* routes
      triggers.ts             ← /internal/triggers/* routes
      scheduler.ts            ← /internal/scheduler/* routes
    helpers/
      redis-helpers.ts        ← typed helpers using redis import
      keys.ts                 ← all Redis key patterns in one place
      clue.ts                 ← Manhattan distance + band mapping
      ranking.ts              ← rank score encoding
  shared/
    types.ts
    constants.ts
```

> **Note:** The Devvit Vite plugin reads `devvit.json` and builds both client and server from a single `vite build` command. No separate build configs needed.

**0.6 — `src/server/helpers/keys.ts` (write once, prevent typos everywhere)**

```ts
export const keys = {
  huntConfig:       (postId: string) => `hunt-${postId}-config`,
  huntRun:          (postId: string, userId: string) => `hunt-${postId}-run-${userId}`,
  huntStats:        (postId: string) => `hunt-${postId}-stats`,
  huntLeaderboard:  (postId: string) => `hunt-${postId}-leaderboard`,
  huntResult:       (postId: string, userId: string) => `hunt-${postId}-result-${userId}`,
  huntDraft:        (draftId: string, userId: string) => `hunt-draft-${draftId}-${userId}`,
  creatorStats:     (userId: string) => `creator-${userId}-stats`,
  dailyPost:        (date: string) => `daily-${date}-post`,
  dailyQueue:       () => `daily-queue`,
  dailyStreak:      (userId: string) => `daily-streak-${userId}`,
};
```

> **Note on key naming:** Devvit Redis does NOT support listing/scanning all keys. Use stable collection keys (hashes, sorted sets) where you need to iterate over related records. Avoid colons (`:`) in keys — while Redis allows them, Devvit Realtime channel names do not allow colons, so keeping a consistent naming convention avoids confusion.

**0.7 — `src/server/helpers/redis-helpers.ts` — typed Redis helpers**

Use the named `redis` import from `@devvit/web/server` (NOT `@devvit/public-api` or `context.redis`):

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

**Exit criteria:** `npm run dev` starts with no TypeScript errors. An empty custom post loads in the browser via playtest.
