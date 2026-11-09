import { transportMissing } from '../trip-route-editing/canvas-issues';
import { canvasName } from '../trip-route-editing/canvas-model';
import { accommodationPeriods, isTripDate } from '../trip-route-editing/lodging-periods';

import type { ArrangementCoverage, ArrangementState } from './types';

/** Reuses explicit route links and bounded accommodation periods; unknown dates never become accommodation gaps. */
export function arrangementCoverage(state: ArrangementState): ArrangementCoverage[] {
  const nodes = state.canvas.order.flatMap((id) => {
    const record = state.canvas.records.find((entry) => entry.id === id);
    return record?.kind === 'city' || record?.kind === 'gap' ? [record] : [];
  });
  const visits = nodes.filter((record) => record.kind === 'city');
  const transport = nodes.flatMap((visit, index): ArrangementCoverage[] => {
    const next = nodes[index + 1];
    if (
      visit.kind !== 'city' ||
      next?.kind !== 'city' ||
      !transportMissing(state.canvas, visit.id, next.id)
    )
      return [];
    return [
      {
        id: `transport-${visit.id}-${next.id}`,
        kind: 'transport',
        recordIds: [visit.id, next.id],
        title: 'Transport not recorded',
        detail: `${canvasName(state.canvas, visit)} → ${canvasName(state.canvas, next)}`,
      },
    ];
  });
  const stays = visits.flatMap((visit) =>
    accommodationPeriods(visit, state.canvas.records).flatMap((period): ArrangementCoverage[] => {
      if (
        !period.missing ||
        !isTripDate(period.start) ||
        !isTripDate(period.end) ||
        period.end <= period.start
      )
        return [];
      return [
        {
          id: `stay-${period.id}`,
          kind: 'stay',
          recordIds: [visit.id],
          title: 'Accommodation not recorded',
          detail: canvasName(state.canvas, visit),
          start: period.start,
          end: period.end,
        },
      ];
    })
  );
  return [...transport, ...stays];
}
