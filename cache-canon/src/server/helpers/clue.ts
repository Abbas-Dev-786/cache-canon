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

  const band = CLUE_BANDS.find(b => dist >= b.min && dist <= b.max);
  const signal = band ? band.signal : 'distant';
  const label = band ? band.label : 'Distant signal';
  return { signal: signal as ClueData['signal'], label };
}
