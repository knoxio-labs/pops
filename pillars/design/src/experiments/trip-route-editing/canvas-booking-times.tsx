import { useMemo, useState } from 'react';

import { TextInput } from '@pops/ui';

import { timingFindings } from './calendar-model';
import { canvasCalendar, canvasTimingRules } from './canvas-calendar';
import { useCanvas } from './canvas-context';
import { localDateTime, zonedInstant } from './canvas-zoned-time';
import { isTripDate } from './lodging-periods';

import type { TripRecord } from '@/fixtures/trip-overview-model';

import type { CanvasState } from './canvas-model';

/** Record-linked timing warnings refresh from actual instants and configured buffer values. */
export function BookingFindings({ recordId }: { recordId: string }) {
  const { state } = useCanvas();
  const findings = useMemo(
    () =>
      timingFindings(canvasCalendar(state), canvasTimingRules(state)).filter((finding) =>
        finding.recordIds.includes(recordId)
      ),
    [state, recordId]
  );
  return findings.map((finding) => (
    <p
      key={finding.id}
      role="status"
      className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-xs text-foreground"
    >
      {finding.message}
    </p>
  ));
}

function isClock(value: string): value is `${number}:${number}` {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function editedSourceBoundaryRecords(
  state: CanvasState,
  id: string,
  field: 'startAt' | 'endAt',
  local: string
): TripRecord[] {
  const bookings = canvasCalendar(state);
  const booking = bookings.find((item) => item.id === id);
  if (!booking) return state.records;
  const legs = bookings.filter((item) => item.recordId === booking.recordId);
  const first = legs[0];
  if (!first) return state.records;
  const boundary = field === 'startAt' ? first : legs.at(-1);
  if (boundary?.id !== id) return state.records;
  const day = local.slice(0, 10);
  const clock = local.slice(11, 16);
  if (!isTripDate(day) || !isClock(clock)) return state.records;
  return state.records.map((record) => {
    if (record.id !== booking.recordId) return record;
    const start =
      record.schedule?.start ?? localDateTime(first.startAt, first.timeZone).slice(0, 10);
    if (!isTripDate(start)) return record;
    const schedule =
      field === 'startAt'
        ? { ...record.schedule, start: day, localTime: clock }
        : { ...record.schedule, start, end: day };
    return { ...record, schedule };
  });
}

function BookingTimeInput({
  id,
  field,
  at,
  zone,
}: {
  id: string;
  field: 'startAt' | 'endAt';
  at: string;
  zone: string;
}) {
  const { state, change } = useCanvas();
  const source = `${at}|${zone}`;
  const [draft, setDraft] = useState<{ source: string; value: string; error?: string }>(() => ({
    source,
    value: localDateTime(at, zone),
  }));
  if (draft.source !== source) setDraft({ source, value: localDateTime(at, zone) });
  function edit(local: string) {
    const resolved = zonedInstant(local, zone);
    if (!resolved) {
      setDraft({ source, value: local, error: `Invalid or ambiguous local time · ${zone}` });
      return;
    }
    setDraft({ source, value: local });
    change({
      ...state,
      records: editedSourceBoundaryRecords(state, id, field, local),
      clockOverrides: {
        ...state.clockOverrides,
        [id]: { ...state.clockOverrides[id], [field]: resolved },
      },
    });
  }
  return (
    <TextInput
      label={`${field === 'startAt' ? 'Start' : 'End'} · ${zone}`}
      type="datetime-local"
      className="min-w-0 w-full"
      value={draft.value}
      error={draft.error}
      onInput={(event) => edit(event.currentTarget.value)}
    />
  );
}

/**
 * Edits IANA wall clocks, rejecting invalid/ambiguous instants. Outer leg edits also
 * synchronize source schedule bounds; internal connection edits retain independent overrides.
 */
export function BookingTimes({
  recordId,
  expanded = false,
}: {
  recordId: string;
  expanded?: boolean;
}) {
  const { state } = useCanvas();
  const bookings = useMemo(
    () =>
      canvasCalendar(state).filter((booking) => booking.recordId === recordId && !booking.allDay),
    [state, recordId]
  );
  if (!bookings.length) return null;
  return (
    <details open={expanded}>
      <summary className="min-h-11 cursor-pointer py-3 text-sm">Times</summary>
      <div className="space-y-4">
        {bookings.map((booking) => (
          <div key={booking.id} className="space-y-2">
            <p className="text-sm font-medium">{booking.title}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <BookingTimeInput
                id={booking.id}
                field="startAt"
                at={booking.startAt}
                zone={booking.timeZone}
              />
              {booking.endAt && (
                <BookingTimeInput
                  id={booking.id}
                  field="endAt"
                  at={booking.endAt}
                  zone={booking.endTimeZone ?? booking.timeZone}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
