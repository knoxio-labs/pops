import { tripPlaceCode, tripPlaceName } from './trip-places';

import type { TripCityTiming, TripDate, TripOverviewItem, TripRecord } from './trip-overview-model';

/** Calendar date formatting uses UTC so the viewer's timezone cannot move the day. */
export function formatTripDate(date: TripDate): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

function visitName(id: string, records: readonly TripRecord[]): string {
  const record = records.find((candidate) => candidate.id === id);
  return record ? tripPlaceName(record.placeId) : 'Location unavailable';
}

function relativeTiming(timing: TripCityTiming, records: readonly TripRecord[]): string {
  const parts: string[] = [];
  if (timing.afterVisitId) parts.push(`After ${visitName(timing.afterVisitId, records)}`);
  if (timing.beforeVisitId)
    parts.push(`${parts.length ? 'before' : 'Before'} ${visitName(timing.beforeVisitId, records)}`);
  return parts.join(' · ');
}

/** Render date precision, duration or referenced route order without inventing bounds. */
export function formatCityTiming(timing: TripCityTiming, records: readonly TripRecord[]): string {
  if (timing.arrival || timing.departure)
    return `${timing.arrival ? formatTripDate(timing.arrival) : 'Arrival unset'} → ${timing.departure ? formatTripDate(timing.departure) : 'Departure unset'}`;
  if (timing.month) {
    const month = new Intl.DateTimeFormat('en-AU', { month: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(timing.month.year, timing.month.month - 1, 1))
    );
    const duration = timing.duration
      ? ` · ${timing.duration.min}–${timing.duration.max} ${timing.duration.unit}`
      : '';
    return `${timing.month.part ?? 'Around'} ${month}${duration}`;
  }
  return relativeTiming(timing, records) || 'Arrival unset → departure unset';
}

function scheduleLabel(record: TripRecord): string {
  if (!record.schedule) return 'Date unset';
  const { start, end, localTime } = record.schedule;
  const range =
    end && end !== start
      ? `${formatTripDate(start)}–${formatTripDate(end)}`
      : formatTripDate(start);
  if (record.kind === 'stay' && end) {
    const nights = (Date.parse(end) - Date.parse(start)) / 86400000;
    return `${range} · ${nights} nights`;
  }
  return localTime ? `${range} · ${localTime}` : range;
}

function recordTitle(record: TripRecord): string {
  if (record.kind === 'city') return tripPlaceName(record.placeId);
  if (record.route)
    return [record.route.fromId, ...(record.route.viaIds ?? []), record.route.toId]
      .map(tripPlaceCode)
      .join(' → ');
  return record.title ?? tripPlaceName(record.placeId);
}

/** Format an open segment from its neighbouring visits; missing references remain visible. */
export function formatRouteGap(record: TripRecord, records: readonly TripRecord[]): string {
  const before = record.timing?.beforeVisitId;
  const after = records.find((candidate) => candidate.id === record.timing?.afterVisitId);
  const start = after?.timing?.departure;
  let from = after ? tripPlaceName(after.placeId) : 'Location unavailable';
  if (start) from = formatTripDate(start);
  const to = before ? visitName(before, records) : 'Location unavailable';
  return `${from} → ${to}`;
}

/** Create display text deterministically from selectable references and structured dates. */
export function presentTripRecord(
  record: TripRecord,
  records: readonly TripRecord[]
): TripOverviewItem {
  let when = scheduleLabel(record);
  if (record.kind === 'gap') when = formatRouteGap(record, records);
  if (record.kind === 'city') when = formatCityTiming(record.timing ?? {}, records);
  return {
    ...record,
    title: record.kind === 'gap' ? formatRouteGap(record, records) : recordTitle(record),
    where: tripPlaceName(record.placeId),
    when,
  };
}
