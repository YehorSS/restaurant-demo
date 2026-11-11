export type Phase = 'oak' | 'cherry' | 'embers' | 'closed';

const OPEN = 12 * 60, CHERRY = 17 * 60, EMBERS = 21 * 60, CLOSE = 23 * 60;

/** What the fire is doing at a given minute of the day in Kyiv. */
export function fireNow(minute: number): { phase: Phase; untilOpen?: number } {
  if (minute >= OPEN && minute < CHERRY) return { phase: 'oak' };
  if (minute >= CHERRY && minute < EMBERS) return { phase: 'cherry' };
  if (minute >= EMBERS && minute < CLOSE) return { phase: 'embers' };
  return { phase: 'closed', untilOpen: (OPEN - minute + 24 * 60) % (24 * 60) };
}

export function kyivNow(now = Date.now()): { date: string; minute: number; time: string } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minute: +p.hour * 60 + +p.minute, time: `${p.hour}:${p.minute}` };
}
