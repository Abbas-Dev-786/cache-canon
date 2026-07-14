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
  foundCells: number[];        // caches already found by this user
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
  isLoggedIn?: boolean;
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
