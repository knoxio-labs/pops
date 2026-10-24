import { tripPlaces } from '@/fixtures/trip-places';
import { useState } from 'react';

import { Button, Select, Sheet } from '@pops/ui';

import type { PlannerState } from './model';

/** Select references for a new visit; the same city can appear more than once. */
export function AddVisit({
  state,
  parentId,
  onClose,
  onAdd,
}: {
  state: PlannerState;
  parentId?: string;
  onClose: () => void;
  onAdd: (placeId: string, afterId?: string) => void;
}) {
  const [placeId, setPlaceId] = useState('curitiba');
  const [afterId, setAfterId] = useState(parentId ?? state.order.at(-1) ?? '');
  const options = state.order.map((id) => {
    const record = state.records.find((r) => r.id === id);
    const place = tripPlaces.find((p) => p.id === record?.placeId);
    return {
      value: id,
      label: `${state.order.indexOf(id) + 1}. ${record?.kind === 'gap' ? 'Alternatives' : (place?.name ?? id)}`,
    };
  });
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={parentId ? 'Add side trip' : 'Add visit'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onAdd(placeId, afterId || undefined)}>Add visit</Button>
        </>
      }
    >
      <div className="space-y-5">
        <Select
          label="City / region"
          value={placeId}
          options={tripPlaces
            .filter((p) => p.kind !== 'airport')
            .map((p) => ({ value: p.id, label: p.name }))}
          onChange={(e) => setPlaceId(e.target.value)}
        />
        {!parentId && (
          <Select
            label="Insert after"
            value={afterId}
            options={[{ value: '', label: 'End of route' }, ...options]}
            onChange={(e) => setAfterId(e.target.value)}
          />
        )}
      </div>
    </Sheet>
  );
}
