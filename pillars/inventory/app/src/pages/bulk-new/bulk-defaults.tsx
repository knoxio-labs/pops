import { useMemo, useState } from 'react';

import { Button, Select } from '@pops/ui';

import { PlacementPath } from '../../foundation/badges/placement-path.js';
import { PlacementPicker } from '../../foundation/placement-picker/placement-picker.js';

import type { ReactElement } from 'react';

import type { FilterOption } from '../../foundation/list-page/list-filters.js';
import type { PlacementTarget, PlacementWorld } from '../../foundation/model/contracts.js';

/** Props for the placement and default-type controls above the bulk grid. */
export interface BulkDefaultsProps {
  world: PlacementWorld;
  recents: readonly PlacementTarget[];
  destination: PlacementTarget;
  onDestination: (target: PlacementTarget) => void;
  types: readonly FilterOption[];
  defaultTypeKey: string | null;
  onDefaultTypeKey: (key: string | null) => void;
}

/** Renders the default placement and type controls for rows without values. */
export function BulkDefaults({
  world,
  recents,
  destination,
  onDestination,
  types,
  defaultTypeKey,
  onDefaultTypeKey,
}: BulkDefaultsProps): ReactElement {
  const [pickerOpen, setPickerOpen] = useState(false);
  const subject = useMemo(() => ({ kind: 'items' as const, ids: [] as const }), []);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <span className="text-muted-foreground">Rows without a Where go to</span>
      <PlacementPath world={world} placement={destination} maxSegments={3} className="shrink-0" />
      <PlacementPicker
        world={world}
        subject={subject}
        recents={recents}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(target) => {
          onDestination(target);
          setPickerOpen(false);
        }}
        trigger={
          <Button type="button" size="sm" variant="outline">
            Change
          </Button>
        }
      />
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      <span className="text-muted-foreground">Rows without a Type are</span>
      <div className="w-44">
        <Select
          size="sm"
          aria-label="Default type"
          value={defaultTypeKey ?? ''}
          placeholder="Untyped"
          options={[...types]}
          onChange={(event) =>
            onDefaultTypeKey(event.target.value === '' ? null : event.target.value)
          }
        />
      </div>
    </div>
  );
}
