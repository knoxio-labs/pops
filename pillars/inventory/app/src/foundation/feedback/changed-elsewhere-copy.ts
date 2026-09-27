import type { WebChangeGroup } from '../../inventory-web/useChangedElsewhere';

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

function elapsedSince(iso: string, now: string): number {
  return Math.max(0, new Date(now).getTime() - new Date(iso).getTime());
}

function dateCopy(iso: string): string {
  return `on ${DATE.format(new Date(iso))}`;
}

function countWithUnit(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

/** Formats a changed-elsewhere age in compact banner copy. */
export function changedAgo(iso: string, now: string): string {
  const elapsed = elapsedSince(iso, now);
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return `${Math.max(1, Math.floor(elapsed / MINUTE))} min ago`;
  if (elapsed < DAY) return `${Math.max(1, Math.floor(elapsed / HOUR))} h ago`;
  return dateCopy(iso);
}

/** Formats a changed-elsewhere age in sentence copy with singular units. */
export function changedAgoLong(iso: string, now: string): string {
  const elapsed = elapsedSince(iso, now);
  if (elapsed < SECOND) return 'just now';
  if (elapsed < MINUTE) {
    return countWithUnit(Math.max(1, Math.floor(elapsed / SECOND)), 'second', 'seconds') + ' ago';
  }
  if (elapsed < HOUR) {
    return countWithUnit(Math.max(1, Math.floor(elapsed / MINUTE)), 'minute', 'minutes') + ' ago';
  }
  if (elapsed < DAY) {
    return countWithUnit(Math.max(1, Math.floor(elapsed / HOUR)), 'hour', 'hours') + ' ago';
  }
  return dateCopy(iso);
}

/** Formats an entity count with the copy used by stale details. */
export function thingsCount(n: number): string {
  return countWithUnit(n, 'thing', 'things');
}

/** Names one actor or counts device and mixed-source groups. */
export function changedBy(groups: readonly WebChangeGroup[]): string {
  if (groups.length === 1) return groups[0]?.actorLabel ?? '0 sources';
  if (groups.length > 1 && groups.every((group) => group.actorKind === 'device')) {
    return `${groups.length} devices`;
  }
  return `${groups.length} sources`;
}

/** Sums the entities represented by changed-elsewhere groups. */
export function changedCount(groups: readonly WebChangeGroup[]): number {
  return groups.reduce((total, group) => total + group.entityCount, 0);
}

/** Builds the changed-elsewhere detail line without a page-specific closing clause. */
export function staleChangeLine(groups: readonly WebChangeGroup[]): string {
  if (groups.length === 0) throw new Error('Cannot format changed-elsewhere copy without groups');
  const count = changedCount(groups);
  const pronoun = count === 1 ? 'it' : 'them';
  return `${changedBy(groups)} changed ${thingsCount(count)}. Reload to see ${pronoun}`;
}

/** Builds a changed-elsewhere title from the newest group and its actor source. */
export function staleTitle(
  subject: string | null,
  groups: readonly WebChangeGroup[],
  now: string
): string {
  const [newest] = groups;
  if (newest === undefined) throw new Error('Cannot format changed-elsewhere title without groups');
  if (subject === null) return `Changed elsewhere ${changedAgo(newest.latestServerTime, now)}.`;
  const prep = groups.every((group) => group.actorKind === 'device') ? 'on' : 'by';
  return `${subject} changed ${prep} ${changedBy(groups)} ${changedAgoLong(newest.latestServerTime, now)}.`;
}
