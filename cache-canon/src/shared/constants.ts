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
