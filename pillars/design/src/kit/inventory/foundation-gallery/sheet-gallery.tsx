/**
 * The side sheet, shown as the bulk "Set field" sheet it most often is, and
 * the move plan a bulk Move confirms from, applicable and refused.
 */
import { coreWorld } from '@/fixtures/inventory/core';
import { bulkMoveIds, closedBoxTarget, shelvingTarget } from '@/fixtures/inventory/placements';

import { Button, Input, Label, Select } from '@pops/ui';

import { MovePlanPanel } from '../move-plan/move-plan';
import { planMove } from '../move-plan/move-plan-model';
import { SheetPanel } from '../shared/sheet';
import { Backdrop, Specimen } from './gallery-frame';

const FIELDS = [
  { value: 'manufacturer', label: 'Manufacturer, 9 of 14 have it' },
  { value: 'powered', label: 'Needs power, 9 of 14 have it' },
  { value: 'brand', label: 'Brand, 5 of 14 have it' },
];

/** The sheet over a page. */
export function SheetGallery() {
  return (
    <Specimen label="Sheet" note="Right-anchored, 480px, Esc closes. Only the body scrolls.">
      <Backdrop className="flex h-128 justify-end">
        <SheetPanel
          title="Set a field on 14 items"
          description="Items whose type lacks the field are left as they are."
          footer={
            <>
              <Button variant="ghost">Cancel</Button>
              <Button>Set on 9 items</Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-field">Field</Label>
              <Select
                id="bulk-field"
                value="manufacturer"
                options={FIELDS}
                onChange={() => undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-value">Manufacturer</Label>
              <Input id="bulk-value" defaultValue="LG" />
              <p className="text-xs text-muted-foreground">
                Replaces the current value on 9 items. Each change can be undone from its history.
              </p>
            </div>
          </div>
        </SheetPanel>
      </Backdrop>
    </Specimen>
  );
}

/** The move plan, once to a place that takes it and once to a closed box. */
export function MovePlanGallery() {
  const toShelving = planMove({
    world: coreWorld,
    selectedIds: bulkMoveIds,
    target: shelvingTarget,
  });
  const toClosed = planMove({
    world: coreWorld,
    selectedIds: bulkMoveIds,
    target: closedBoxTarget,
  });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Specimen label="Move plan" note="Carried contents and refusals before the button.">
        <div className="rounded-xl border bg-card p-4">
          <MovePlanPanel plan={toShelving} world={coreWorld} onChangeTarget={() => undefined} />
        </div>
      </Specimen>
      <Specimen label="Target refuses" note="Nothing moves; the fix is named.">
        <div className="rounded-xl border bg-card p-4">
          <MovePlanPanel plan={toClosed} world={coreWorld} onChangeTarget={() => undefined} />
        </div>
      </Specimen>
    </div>
  );
}
