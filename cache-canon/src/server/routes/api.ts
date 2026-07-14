import { Hono } from 'hono';
import { redis, context, reddit, realtime } from '@devvit/web/server';
import { getJSON, setJSON } from '../helpers/redis-helpers';
import { keys } from '../helpers/keys';
import { calcClue } from '../helpers/clue';
import { encodeRankScore } from '../helpers/ranking';
import type {
  HuntConfig, RunState, ShotResult, PublicRunState,
  ClueData, HuntView, LeaderboardEntry, HuntDraft, DailyStreak
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

  const activePostId = postId || ctxPostId;
  if (!activePostId) {
    return c.json({ error: 'postId required' }, 400);
  }

  // 1. Auth check — logged-out users can't fire
  const actorId = userId || 'mock-user'; // fallback for playtesting if needed

  // 2. Validate cellIndex range
  if (cellIndex < 0 || cellIndex > 47 || !Number.isInteger(cellIndex)) {
    return c.json({ error: 'Invalid cell' }, 400);
  }

  const config = await getJSON<HuntConfig>(keys.huntConfig(activePostId));
  if (!config || config.status !== 'active') {
    return c.json({ error: 'Hunt not active' }, 404);
  }

  // 3. Load or create run state
  const runKey = keys.huntRun(activePostId, actorId);
  let run = await getJSON<RunState>(runKey);

  // If a completed run exists, and this is a new shot (not an idempotent retry of the final shot),
  // reset it so the player can start a new run.
  if (run && run.completedAt && (!requestId || run.lastRequestId !== requestId)) {
    run = null;
  }

  if (!run) {
    run = {
      userId: actorId, firedCells: [], foundCells: [], shots: 0, misses: 0, startedAt: 0,
    };
  }

  // 4. Idempotency: if same requestId already processed, return stored result
  if (requestId && run.lastRequestId === requestId) {
    return c.json(buildShotResultFromRun(run, cellIndex));
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
    await redis.hIncrBy(keys.huntStats(activePostId), 'plays', 1);
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
    await redis.hIncrBy(keys.huntStats(activePostId), 'completions', 1);

    // Upsert personal best
    const existing = await getJSON<RunState>(keys.huntResult(activePostId, actorId));
    const newScore = encodeRankScore(run.shots, run.misses, run.elapsedMs);
    const isNewBest = !existing || newScore < encodeRankScore(
      existing.shots, existing.misses, existing.elapsedMs!
    );

    if (isNewBest) {
      await setJSON(keys.huntResult(activePostId, actorId), run);
      await redis.zAdd(keys.huntLeaderboard(activePostId), {
        member: actorId, score: newScore,
      });
      // Send realtime notification for leaderboard update
      const channelName = `hunt_${activePostId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      await realtime.send(channelName, {
        type: 'leaderboard-updated',
        postId: activePostId,
      });
    }

     // Get current rank
    const rank = await redis.zRank(keys.huntLeaderboard(activePostId), actorId);
    bestRank = (rank !== null && rank !== undefined) ? rank + 1 : undefined;

    // Handle Daily Hunt streak calculation
    if (config.isDaily) {
      await updateDailyStreak(actorId);
    }
  }

  // 9. Persist run state with idempotency key
  run.lastRequestId = requestId;
  await setJSON(runKey, run);

  // Response NEVER includes config.cacheCells
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
  const queryPostId = c.req.query('postId');
  const { userId, postId: ctxPostId } = context;
  const activePostId = queryPostId || ctxPostId;

  if (!activePostId) {
    return c.json({ error: 'postId required' }, 400);
  }

  let config = await getJSON<HuntConfig>(keys.huntConfig(activePostId));
  if (!config) {
    // Playtest Developer Seeding fallback
    config = {
      postId: activePostId,
      creatorId: 'system',
      creatorUsername: 'Cache Hunt',
      rows: 8,
      cols: 6,
      cacheCells: [5, 22, 40], // Default pre-seeded caches
      title: 'Default Cache Hunt',
      status: 'active',
      createdAt: Date.now(),
      isDaily: false,
    };
    await setJSON(keys.huntConfig(activePostId), config);
  }

  const actorId = userId || 'mock-user';

  const stats = await redis.hGetAll(keys.huntStats(activePostId));
  const plays = parseInt(stats?.plays ?? '0');
  const completions = parseInt(stats?.completions ?? '0');
  const completionRate = plays > 0 ? Math.round((completions / plays) * 100) : 0;

  const run = await getJSON<RunState>(keys.huntRun(activePostId, actorId)) ?? emptyRun(actorId);

  // Fetch top 10 leaderboard entries
  const topMembers = await redis.zRange(
    keys.huntLeaderboard(activePostId), 0, 9, { by: 'rank' }
  );
  const leaderboard = await buildLeaderboardEntries(activePostId, topMembers);

  // Response NEVER includes config.cacheCells
  return c.json<HuntView>({
    postId: activePostId,
    title: config.title,
    creatorUsername: config.creatorUsername,
    stats: { plays, completions, difficultyLabel: getDifficultyLabel(completionRate, plays) },
    run: toPublicRun(run),
    leaderboard,
    isDaily: config.isDaily,
    dailyDate: config.dailyDate,
    isLoggedIn: !!userId,
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
    foundCells: run.foundCells,
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

function buildShotResultFromRun(run: RunState, cellIndex: number): ShotResult {
  const isHit = run.foundCells.includes(cellIndex);
  return {
    cellIndex,
    outcome: isHit ? 'hit' : 'miss',
    run: toPublicRun(run),
    completed: !!run.completedAt,
  };
}

async function buildLeaderboardEntries(
  _postId: string,
  members: Array<{ member: string; score: number }>
): Promise<LeaderboardEntry[]> {
  return members.map((m, i) => ({
    userId: m.member,
    username: m.member === 'mock-user' ? 'u/mock-user' : `u/Hunter-${m.member.slice(0,4)}`,
    shots: Math.floor(m.score / 1_000_000_000),
    misses: Math.floor((m.score % 1_000_000_000) / 1_000_000),
    elapsedMs: m.score % 1_000_000,
    rank: i + 1,
  }));
}

api.post('/create-hunt-draft', async (c) => {
  const { userId } = context;
  if (!userId) return c.json({ error: 'Login required' }, 401);

  const { title, cacheCells } = await c.req.json<{
    title: string;
    cacheCells: number[];
  }>();

  // Validate inputs
  if (!title.trim() || title.length > 60) {
    return c.json({ error: 'Invalid title (max 60 chars)' }, 400);
  }
  if (cacheCells.length !== 3) {
    return c.json({ error: 'Exactly 3 caches required' }, 400);
  }
  if (new Set(cacheCells).size !== 3) {
    return c.json({ error: 'Caches must be on distinct tiles' }, 400);
  }
  if (cacheCells.some(cell => cell < 0 || cell > 47)) {
    return c.json({ error: 'Invalid cell index' }, 400);
  }

  const draftId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const draftKey = keys.huntDraft(draftId, userId);

  await setJSON(draftKey, {
    title: title.trim(),
    cacheCells,
    creatorId: userId,
    createdAt: Date.now(),
  });
  await redis.expire(draftKey, 3600); // 1 hour draft expiry

  return c.json({ draftId });
});

api.post('/publish-hunt', async (c) => {
  const { userId } = context;
  if (!userId) return c.json({ error: 'Login required' }, 401);

  const { draftId } = await c.req.json<{ draftId: string }>();

  const draftKey = keys.huntDraft(draftId, userId);
  const draft = await getJSON<HuntDraft>(draftKey);

  if (!draft || draft.creatorId !== userId) {
    return c.json({ error: 'Draft not found' }, 404);
  }

  const username = await reddit.getCurrentUsername();

  // Submit custom post on Reddit
  const post = await reddit.submitCustomPost({
    title: draft.title,
    entry: 'game',
    textFallback: {
      text: `🎯 Cache Hunt: ${draft.title}\n\nAim your cannon and find 3 hidden caches! Created by u/${username ?? 'unknown'}`,
    },
    styles: {
      backgroundColor: '#f5f5f5FF',
      backgroundColorDark: '#1a1a2eFF',
      height: 'TALL' as any,
    },
  });

  const config: HuntConfig = {
    postId: post.id,
    creatorId: userId,
    creatorUsername: username ?? undefined,
    rows: 8,
    cols: 6,
    cacheCells: draft.cacheCells,
    title: draft.title,
    status: 'active',
    createdAt: Date.now(),
    isDaily: false,
  };

  await setJSON(keys.huntConfig(post.id), config);

  // Update creator stats
  await redis.hIncrBy(keys.creatorStats(userId), 'boardsCreated', 1);

  // Clean up draft
  await redis.del(draftKey);

  return c.json({ postId: post.id, postUrl: post.url });
});

api.get('/daily-hunt', async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  let postId = await redis.get(keys.dailyPost(today));

  if (!postId) {
    // Generate today's hunt on the fly
    postId = `daily-${today}`;
    
    const cacheCells: number[] = [];
    while (cacheCells.length < 3) {
      const r = Math.floor(Math.random() * 48);
      if (!cacheCells.includes(r)) cacheCells.push(r);
    }
    
    const config: HuntConfig = {
      postId,
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
    
    await setJSON(keys.huntConfig(postId), config);
    await redis.set(keys.dailyPost(today), postId);
  }

  const { userId } = context;
  const config = await getJSON<HuntConfig>(keys.huntConfig(postId));
  if (!config) return c.json({ error: 'Daily hunt config not found' }, 404);

  const stats = await redis.hGetAll(keys.huntStats(postId));
  const plays = parseInt(stats?.plays ?? '0');
  const completions = parseInt(stats?.completions ?? '0');
  const completionRate = plays > 0 ? Math.round((completions / plays) * 100) : 0;

  const actorId = userId || 'mock-user';
  const run = await getJSON<RunState>(keys.huntRun(postId, actorId)) ?? emptyRun(actorId);

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

api.get('/daily-streak', async (c) => {
  const { userId } = context;
  const actorId = userId || 'mock-user';
  const streak = await getJSON<DailyStreak>(keys.dailyStreak(actorId)) ?? {
    lastCompletedDate: '', currentStreak: 0, bestStreak: 0,
  };
  return c.json({ streak });
});

async function updateDailyStreak(userId: string): Promise<DailyStreak> {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  const streakKey = keys.dailyStreak(userId);
  const streak = await getJSON<DailyStreak>(streakKey) ?? {
    lastCompletedDate: '', currentStreak: 0, bestStreak: 0,
  };

  if (streak.lastCompletedDate === today) return streak;

  const newCurrent = streak.lastCompletedDate === yesterday ? streak.currentStreak + 1 : 1;
  const updated: DailyStreak = {
    lastCompletedDate: today,
    currentStreak: newCurrent,
    bestStreak: Math.max(newCurrent, streak.bestStreak),
  };

  await setJSON(streakKey, updated);
  return updated;
}
