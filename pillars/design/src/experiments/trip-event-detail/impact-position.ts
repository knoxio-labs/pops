import {
  formatCityTiming,
  formatRouteGap,
  presentTripRecord,
} from '@/fixtures/trip-overview-format';

import { canvasName } from '../trip-route-editing/canvas-model';

import type { TripRecord } from '@/fixtures/trip-overview-model';

import type { CanvasState } from '../trip-route-editing/canvas-model';

function positionName(state: CanvasState, record: TripRecord): string {
  if (record.kind === 'city')
    return ['City', canvasName(state, record), formatCityTiming(record.timing ?? {})]
      .filter(Boolean)
      .join(' · ');
  if (record.kind === 'gap') return `Alternatives · ${formatRouteGap(record, state.records)}`;
  const display = presentTripRecord(record, state.records);
  return [record.kind, display.title, display.when].filter(Boolean).join(' · ');
}

/** Name every explicit route anchor from its source kind, place, route and dates; missing records cannot be selected. */
export function routePositionOptions(state: CanvasState) {
  const positions = state.order.map((id) => {
    const record = state.records.find((item) => item.id === id);
    return {
      value: `after:${id}`,
      label: record ? `After ${positionName(state, record)}` : 'Unavailable route item',
      disabled: !record,
    };
  });
  return [
    { value: 'start', label: 'Start of route', disabled: false },
    ...positions.map((position, index) => ({
      ...position,
      label:
        positions.filter((candidate) => candidate.label === position.label).length > 1
          ? `${position.label} · route position ${index + 1}`
          : position.label,
    })),
  ];
}
