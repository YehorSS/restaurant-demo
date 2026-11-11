import type { Hours } from '../../shared/api';

export const STEP = 30;
const VISIT = 120;
const toMin = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
export const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** First and last minute shown on the day grid; a closed day shows 12:00-23:00. */
export function gridRange(hours: Hours[]): { from: number; to: number } {
  if (!hours.length) return { from: 720, to: 1380 };
  return { from: Math.min(...hours.map(h => toMin(h.open))), to: Math.max(...hours.map(h => toMin(h.close))) };
}

/** 1-based CSS grid column and span for a booking. */
export function gridPlacement(b: { start: string; end: string }, dayStart: number): { col: number; span: number } {
  const s = toMin(b.start);
  let e = toMin(b.end);
  if (e <= s) e += 24 * 60; // visit runs past midnight
  return { col: (s - dayStart) / STEP + 1, span: (e - s) / STEP };
}

/** Start times a visit can take within the opening shifts. */
export function timeOptions(hours: Hours[]): string[] {
  return [...hours].sort((a, b) => toMin(a.open) - toMin(b.open)).flatMap(h => {
    const out: string[] = [];
    for (let t = toMin(h.open); t + VISIT <= toMin(h.close); t += STEP) out.push(fmt(t));
    return out;
  });
}
