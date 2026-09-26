/**
 * The two bulk sheets the Items selection bar opens: Move, which confirms
 * from the move plan (what moves, what rides along, what cannot go), and
 * Set field, one field and one value, saying how many selected items have
 * that field before anything is written.
 */
import { Button, Input, Label, Select } from '@pops/ui';

import { MovePlanPanel, SheetPanel, planMove } from '../foundation';
import { TypeTreePicker } from '../type-tree/type-tree-picker';

import type { PlacementTarget, PlacementWorld } from '../foundation';
import type { TypeTreeRecord } from '../type-tree/model';

/** The bulk Move sheet, after a target was picked. */
export function BulkMoveSheet({
  world,
  ids,
  target,
}: {
  world: PlacementWorld;
  ids: readonly string[];
  target: PlacementTarget;
}) {
  const plan = planMove({ world, selectedIds: ids, target });
  return (
    <SheetPanel
      title={`Move ${String(ids.length)} selected`}
      description="Containers take their contents with them."
      className="rounded-none rounded-l-xl"
    >
      <MovePlanPanel plan={plan} world={world} onChangeTarget={() => undefined} />
    </SheetPanel>
  );
}

/** One field the selection could set, and how many of the selection have it. */
export interface SettableField {
  key: string;
  label: string;
  have: number;
}

/** The bulk Set field sheet. */
export function BulkSetFieldSheet({
  count,
  fields,
  value,
}: {
  count: number;
  fields: readonly [SettableField, ...SettableField[]];
  value: string;
}) {
  const [chosen] = fields;
  const skipped = count - chosen.have;
  return (
    <SheetPanel
      title={`Set a field on ${String(count)} items`}
      description="One field, one value. Each item's change is its own history event."
      className="rounded-none rounded-l-xl"
      footer={
        <>
          <Button variant="ghost">Cancel</Button>
          <Button>Set on {chosen.have} items</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="bulk-field">Field</Label>
          <Select
            id="bulk-field"
            value={chosen.key}
            options={fields.map((field) => ({
              value: field.key,
              label: `${field.label}: ${String(field.have)} of ${String(count)} have it`,
            }))}
            onChange={() => undefined}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bulk-value">{chosen.label}</Label>
          <Input id="bulk-value" defaultValue={value} />
        </div>
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {`Replaces ${chosen.label} on ${String(chosen.have)} items.`}
          {skipped > 0
            ? ` ${String(skipped)} have no ${chosen.label} field and stay as they are.`
            : ''}
          {' Undo reverts all of them while the toast shows.'}
        </p>
      </div>
    </SheetPanel>
  );
}

/** One selected item and the shared values that survive a type change. */
export interface TypeChangePreview {
  item: string;
  kept: readonly string[];
}

/** The bulk type sheet, with the same shared-value preview as the item form. */
export function BulkSetTypeSheet({
  count,
  currentType,
  nextType,
  types,
  preview,
}: {
  count: number;
  currentType: string;
  nextType: string;
  types: readonly TypeTreeRecord[];
  preview: readonly TypeChangePreview[];
}) {
  return (
    <SheetPanel
      title={`Set type on ${String(count)} items`}
      description="Choose a type. Values shared by both types stay on each item."
      className="rounded-none rounded-l-xl"
      footer={
        <>
          <Button variant="ghost">Cancel</Button>
          <Button>Set type on {count} items</Button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          {currentType} <span className="text-muted-foreground">to</span> {nextType}
        </p>
        <TypeTreePicker
          types={types}
          value="type-quilt-cover"
          open
          label="New type"
          placeholder="Choose the new type"
        />
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Values kept</h3>
          <ul className="space-y-2 text-sm">
            {preview.map((entry) => (
              <li key={entry.item} className="rounded-lg border px-3 py-2">
                <span className="font-medium">{entry.item}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {entry.kept.length === 0 ? 'No shared values' : entry.kept.join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SheetPanel>
  );
}
