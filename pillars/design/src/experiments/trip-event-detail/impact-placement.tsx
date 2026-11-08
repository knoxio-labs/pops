import { useState } from 'react';

import { Button, Select } from '@pops/ui';

import { moveCard } from '../trip-route-editing/canvas-actions';
import { useCanvas } from '../trip-route-editing/canvas-context';
import { routePositionOptions } from './impact-position';

import type { TripRecord } from '@/fixtures/trip-overview-model';

/** Insert the associated visit only after an explicit user choice of route position. */
export function EventCityInsertion({ visit }: { visit: TripRecord }) {
  const canvas = useCanvas();
  const { state } = canvas;
  const [anchor, setAnchor] = useState('');
  const positions = routePositionOptions(state);
  return (
    <div className="space-y-3 rounded-xl border p-3">
      <Select
        label="Insert city"
        value={anchor}
        placeholder="Choose route position"
        className="min-h-11"
        options={positions}
        onChange={(change) => setAnchor(change.target.value)}
      />
      <Button
        variant="outline"
        className="min-h-11"
        disabled={!positions.some((position) => position.value === anchor && !position.disabled)}
        onClick={() => {
          canvas.change(
            moveCard(state, visit.id, {
              after: anchor === 'start' ? undefined : anchor.slice(6),
            })
          );
        }}
      >
        Add city to route
      </Button>
    </div>
  );
}
