import { formatTripDate } from '@/fixtures/trip-overview-format';
import { isPurchasedArrangement } from '@/fixtures/trip-overview-model';

import { canvasName } from '../trip-route-editing/canvas-model';
import { accommodationPeriods } from '../trip-route-editing/lodging-periods';
import { previewVisits } from './model';

import type { TripRecord } from '@/fixtures/trip-overview-model';

import type { CanvasState } from '../trip-route-editing/canvas-model';
import type { AlternativesState } from './model';

/** Deterministic comparison findings retain source IDs and never imply a cancellation. */
export interface AlternativeFinding {
  id: string;
  kind: 'transport' | 'accommodation' | 'conflict' | 'purchase' | 'reference';
  title: string;
  detail: string;
}

function connectionFindings(
  canvas: CanvasState,
  visit: TripRecord,
  next: TripRecord
): AlternativeFinding[] {
  const findings: AlternativeFinding[] = [];
  const title = `${canvasName(canvas, visit)} → ${canvasName(canvas, next)}`;
  const linked = canvas.records.some((record) => {
    const link = canvas.transitLinks[record.id];
    return record.kind === 'transport' && link?.from === visit.id && link.to === next.id;
  });
  if (!linked)
    findings.push({
      id: `transport-${visit.id}-${next.id}`,
      kind: 'transport',
      title,
      detail: 'Transport',
    });
  if (
    visit.timing?.departure &&
    next.timing?.arrival &&
    visit.timing.departure > next.timing.arrival
  )
    findings.push({
      id: `order-${visit.id}-${next.id}`,
      kind: 'conflict',
      title,
      detail: 'Arrival precedes previous departure',
    });
  return findings;
}

function accommodationFindings(canvas: CanvasState, visit: TripRecord): AlternativeFinding[] {
  const title = canvasName(canvas, visit);
  const arranged = canvas.records.some(
    (record) =>
      record.kind === 'stay' &&
      record.visitId === visit.id &&
      ['Booked', 'Agreed'].includes(record.arrangement)
  );
  const findings: AlternativeFinding[] = [];
  if ((!visit.timing?.arrival || !visit.timing.departure) && !arranged)
    findings.push({ id: `stay-${visit.id}`, kind: 'accommodation', title, detail: '' });
  for (const period of accommodationPeriods(visit, canvas.records)) {
    if (period.missing && period.start && period.end)
      findings.push({
        id: `stay-${visit.id}-${period.start}`,
        kind: 'accommodation',
        title,
        detail: `${formatTripDate(period.start)} → ${formatTripDate(period.end)}`,
      });
  }
  return findings;
}

function dateFindings(canvas: CanvasState, visit: TripRecord): AlternativeFinding[] {
  const findings: AlternativeFinding[] = [];
  const { arrival, departure } = visit.timing ?? {};
  if (arrival && departure && arrival > departure)
    findings.push({
      id: `date-${visit.id}`,
      kind: 'conflict',
      title: canvasName(canvas, visit),
      detail: 'Departure precedes arrival',
    });
  for (const record of canvas.records.filter((item) => item.visitId === visit.id)) {
    if (!record.schedule) continue;
    const { start, end } = record.schedule;
    if ((arrival && start < arrival) || (departure && (end ?? start) > departure))
      findings.push({
        id: `outside-${record.id}`,
        kind: 'conflict',
        title: canvasName(canvas, record),
        detail: 'Outside visit dates',
      });
  }
  return findings;
}

function excludedPurchases(state: AlternativesState, visits: TripRecord[]): AlternativeFinding[] {
  const { canvas } = state;
  const candidateIds = new Set(visits.map((visit) => visit.id));
  const optionVisitIds = new Set(
    canvas.sections.filter((item) => item.gapId === state.gapId).flatMap((item) => item.cards)
  );
  return canvas.records
    .filter(
      (record) =>
        record.visitId &&
        optionVisitIds.has(record.visitId) &&
        !candidateIds.has(record.visitId) &&
        isPurchasedArrangement(record)
    )
    .map((record) => ({
      id: record.id,
      kind: 'purchase',
      title: canvasName(canvas, record),
      detail: 'Purchased · outside preview',
    }));
}

/** Compare membership, dates, checkout-night coverage and explicit transport endpoints without mutation. */
export function alternativeFindings(
  state: AlternativesState,
  sectionId: string
): AlternativeFinding[] {
  const { canvas } = state;
  const section = canvas.sections.find(
    (item) => item.id === sectionId && item.gapId === state.gapId
  );
  if (!section) return [];
  const visits = previewVisits(state, sectionId);
  const findings: AlternativeFinding[] = section.cards
    .filter((id) => !canvas.records.some((record) => record.id === id && record.kind === 'city'))
    .map((id) => ({ id, kind: 'reference', title: 'Visit unavailable', detail: '' }));
  for (const [index, visit] of visits.entries()) {
    const next = visits[index + 1];
    if (next) findings.push(...connectionFindings(canvas, visit, next));
    if (section.cards.includes(visit.id))
      findings.push(...accommodationFindings(canvas, visit), ...dateFindings(canvas, visit));
  }
  return [...findings, ...excludedPurchases(state, visits)];
}
