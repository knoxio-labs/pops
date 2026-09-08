/**
 * Date-range helpers for the FromPlanPage.
 *
 * Keeps the date math out of the component so the tests can exercise the
 * "↺ This week" snap, the +6 default, and the > 90-day client-side gate
 * without rendering the page.
 */

const MS_PER_DAY = 86_400_000;
const MAX_RANGE_DAYS = 90;

export function todayIso(today: Date = new Date()): string {
  return toLocalIso(today);
}

export function addDaysIso(iso: string, days: number): string {
  const parsed = parseIsoDate(iso);
  if (parsed === null) return iso;
  const next = new Date(parsed);
  next.setUTCDate(next.getUTCDate() + days);
  return formatIso(next);
}

export function defaultRange(today: Date = new Date()): { start: string; end: string } {
  const start = toLocalIso(today);
  return { start, end: addDaysIso(start, 6) };
}

export function isoMondayFor(today: Date = new Date()): string {
  // Read today's LOCAL calendar day first (see toLocalIso), then normalise to
  // UTC midnight so DST/TZ never shifts the weekday during the walk back to
  // ISO Monday (dow=1).
  const localIso = toLocalIso(today);
  const utc = new Date(parseIsoDate(localIso) as number);
  const dow = utc.getUTCDay(); // 0=Sun..6=Sat
  const offset = dow === 0 ? -6 : 1 - dow;
  utc.setUTCDate(utc.getUTCDate() + offset);
  return formatIso(utc);
}

export function isoSundayFor(today: Date = new Date()): string {
  return addDaysIso(isoMondayFor(today), 6);
}

export interface RangeValidationOk {
  ok: true;
  days: number;
}

export interface RangeValidationErr {
  ok: false;
  reason: 'EndBeforeStart' | 'TooLong' | 'BadFormat';
}

export type RangeValidation = RangeValidationOk | RangeValidationErr;

export function validateRange(start: string, end: string): RangeValidation {
  const a = parseIsoDate(start);
  const b = parseIsoDate(end);
  if (a === null || b === null) return { ok: false, reason: 'BadFormat' };
  if (b < a) return { ok: false, reason: 'EndBeforeStart' };
  const days = Math.round((b - a) / MS_PER_DAY) + 1;
  if (days > MAX_RANGE_DAYS) return { ok: false, reason: 'TooLong' };
  return { ok: true, days };
}

// Formats a Date that is already UTC-anchored (from parseIsoDate or UTC-only
// arithmetic) back into YYYY-MM-DD. Never call this on a `new Date()` wall-clock
// value — use toLocalIso for that; see the trap this fixes in
// pillars/finance/app/src/lib/local-date.ts.
function formatIso(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// A wall-clock Date's LOCAL calendar day as YYYY-MM-DD. `toISOString()` /
// UTC getters convert to UTC first, which is a day ahead of the local
// calendar day for every hour local time leads UTC (e.g. 00:00-10:00 AEST)
// and a day behind west of UTC — see
// pillars/finance/app/src/lib/local-date.ts for the full writeup.
function toLocalIso(d: Date): string {
  const year = String(d.getFullYear()).padStart(4, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIsoDate(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const ms = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}
