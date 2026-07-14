import { RANK } from '../../shared/constants';

export function encodeRankScore(shots: number, misses: number, elapsedMs: number): number {
  return shots  * RANK.SHOTS_WEIGHT
       + misses * RANK.MISSES_WEIGHT
       + Math.min(elapsedMs, RANK.MAX_TIME_MS);
}
