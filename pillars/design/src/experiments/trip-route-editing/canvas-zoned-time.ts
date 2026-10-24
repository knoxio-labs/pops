import { instant } from './calendar-time';

function formatter(zone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
}

function wallTime(at: number, format: Intl.DateTimeFormat): string {
  const parts = format.formatToParts(new Date(at));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}:${value('second')}`;
}

function offsetAt(at: number, format: Intl.DateTimeFormat): number {
  return Date.parse(`${wallTime(at, format)}Z`) - at;
}

function offsetString(offset: number): string {
  const minutes = Math.abs(offset) / 60_000;
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const rest = (minutes % 60).toString().padStart(2, '0');
  return `${offset < 0 ? '-' : '+'}${hours}:${rest}`;
}

/** Formats a precise instant for a minute-resolution editor in its declared IANA zone. */
export function localDateTime(at: string, zone: string): string {
  if (!Number.isFinite(instant(at))) return '';
  try {
    return wallTime(instant(at), formatter(zone)).slice(0, 16);
  } catch {
    return '';
  }
}

/** Resolves a wall clock through IANA rules; invalid, skipped and repeated local times return undefined. */
export function zonedInstant(local: string, zone: string): string | undefined {
  const normalized = local.length === 16 ? `${local}:00` : local;
  const wall = instant(`${normalized}Z`);
  if (!Number.isFinite(wall)) return undefined;
  try {
    const format = formatter(zone);
    const day = 86_400_000;
    const offsets = new Set(
      [-2, -1, 0, 1, 2].map((distance) => offsetAt(wall + distance * day, format))
    );
    const matches = [...offsets].filter((offset) => wallTime(wall - offset, format) === normalized);
    const offset = matches[0];
    if (matches.length !== 1 || offset === undefined || offset % 60_000 !== 0) return undefined;
    return `${normalized}${offsetString(offset)}`;
  } catch {
    return undefined;
  }
}
