import type { TripDate, TripRecord } from '@/fixtures/trip-overview-model';

/** A half-open accommodation interval; absent bounds remain unknown, never inferred. */
export interface AccommodationPeriod {
  id: string;
  start?: TripDate;
  end?: TripDate;
  stays: TripRecord[];
  activities: TripRecord[];
  missing: boolean;
  overlap: boolean;
  conflict?: boolean;
}

interface DatedRecord {
  record: TripRecord;
  start: TripDate;
  end: TripDate;
}

/** Narrow canonical calendar dates, rejecting normalized impossible dates. */
export function isTripDate(date: string | undefined): date is TripDate {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date;
}

function nextDay(date: TripDate): TripDate | undefined {
  const next = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return isTripDate(next) ? next : undefined;
}

function datedRecord(record: TripRecord): DatedRecord | undefined {
  const start = record.schedule?.start;
  const end =
    record.schedule?.end ??
    (record.kind !== 'stay' && isTripDate(start) ? nextDay(start) : undefined);
  if (!isTripDate(start) || !isTripDate(end) || end <= start) return undefined;
  return { record, start, end };
}

function intersects(range: DatedRecord, start?: TripDate, end?: TripDate): boolean {
  return (!end || range.start < end) && (!start || range.end > start);
}

function arranged(record: TripRecord): boolean {
  return record.arrangement === 'Booked' || record.arrangement === 'Agreed';
}

interface DateBounds {
  start?: TripDate;
  end?: TripDate;
}

function visitBounds(visit: TripRecord): DateBounds {
  const start = isTripDate(visit.timing?.arrival) ? visit.timing.arrival : undefined;
  const end = isTripDate(visit.timing?.departure) ? visit.timing.departure : undefined;
  return start && end && end <= start ? {} : { start, end };
}

function periodBounds(stays: DatedRecord[], start?: TripDate, end?: TripDate): TripDate[] {
  const boundaries = new Set<TripDate>();
  if (start) boundaries.add(start);
  if (end) boundaries.add(end);
  for (const stay of stays) {
    if (!intersects(stay, start, end)) continue;
    boundaries.add(start && stay.start < start ? start : stay.start);
    boundaries.add(end && stay.end > end ? end : stay.end);
  }
  return [...boundaries].toSorted();
}

function createPeriod(
  visitId: string,
  stays: DatedRecord[],
  activities: DatedRecord[],
  { start, end }: DateBounds
): AccommodationPeriod {
  const active = stays.filter((stay) => intersects(stay, start, end));
  const coverage = active.filter((stay) => arranged(stay.record));
  return {
    id: `${visitId}:${start ?? 'unknown'}:${end ?? 'unknown'}`,
    start,
    end,
    stays: active.map((stay) => stay.record),
    activities: activities
      .filter((activity) => intersects(activity, start, end))
      .map((activity) => activity.record),
    missing: coverage.length === 0,
    overlap: coverage.length > 1,
  };
}

function classifyDates(records: TripRecord[]): { dated: DatedRecord[]; undated: TripRecord[] } {
  const dated: DatedRecord[] = [];
  const undated: TripRecord[] = [];
  for (const record of records) {
    const range = datedRecord(record);
    if (range) dated.push(range);
    else undated.push(record);
  }
  return { dated, undated };
}

function retainUnplaced(
  periods: AccommodationPeriod[],
  visitId: string,
  stays: DatedRecord[],
  activities: DatedRecord[]
): void {
  const visible = new Set(
    periods.flatMap((period) => [...period.stays, ...period.activities].map((record) => record.id))
  );
  const unplacedStays = stays
    .filter((range) => !visible.has(range.record.id))
    .map((range) => range.record);
  const unplacedActivities = activities
    .filter((range) => !visible.has(range.record.id))
    .map((range) => range.record);
  if (!unplacedStays.length && !unplacedActivities.length) return;
  periods.push({
    id: `${visitId}:outside-periods`,
    stays: unplacedStays,
    activities: unplacedActivities,
    missing: false,
    overlap: false,
    conflict: true,
  });
}

/**
 * Project visit accommodation coverage without changing records. Checkout is exclusive;
 * day-only activities last one day. Only arranged, valid stays supply coverage.
 * Invalid or absent dates remain in separate unscheduled periods for correction.
 */
export function accommodationPeriods(
  visit: TripRecord,
  records: readonly TripRecord[]
): AccommodationPeriod[] {
  const children = records.filter((record) => record.visitId === visit.id);
  const stays = classifyDates(children.filter((record) => record.kind === 'stay'));
  const activities = classifyDates(
    children.filter((record) => ['event', 'person', 'idea'].includes(record.kind))
  );
  const { start, end } = visitBounds(visit);
  const ordered = periodBounds(stays.dated, start, end);
  const periods: AccommodationPeriod[] = [];
  for (let index = 1; index < ordered.length; index += 1) {
    periods.push(
      createPeriod(visit.id, stays.dated, activities.dated, {
        start: ordered[index - 1],
        end: ordered[index],
      })
    );
  }
  if (periods.length === 0)
    periods.push(createPeriod(visit.id, stays.dated, activities.dated, { start, end }));
  retainUnplaced(periods, visit.id, stays.dated, activities.dated);
  if (stays.undated.length > 0) {
    periods.push({
      id: `${visit.id}:unscheduled-stays`,
      stays: stays.undated,
      activities: [],
      missing: true,
      overlap: false,
    });
  }
  if (activities.undated.length > 0) {
    periods.push({
      id: `${visit.id}:unassigned-activities`,
      stays: [],
      activities: activities.undated,
      missing: false,
      overlap: false,
    });
  }
  return periods;
}
