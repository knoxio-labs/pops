import { useState } from 'react';

import { Button, ComboboxSelect, Label, Sheet } from '@pops/ui';

import { bulkItemCount, sharedTypeFieldLabels } from './bulk-action-model.js';

import type { ReactElement } from 'react';

import type {
  CatalogueDescriptor,
  CatalogueType,
} from '../../inventory-web/useCatalogueLookups.js';
import type { ItemRowModel } from '../model/model.js';
import type { BulkActionState } from './bulk-action-types.js';

function activeTypes(catalogue: CatalogueDescriptor | undefined): CatalogueType[] {
  return (catalogue?.types ?? [])
    .filter((type) => type.archivedAt === null)
    .toSorted((left, right) => left.sortOrder - right.sortOrder);
}

function selectedRows(rows: readonly ItemRowModel[], ids: readonly string[]): ItemRowModel[] {
  const selected = new Set(ids);
  return rows.filter((row) => selected.has(row.id));
}

function currentTypeLabel(
  rows: readonly ItemRowModel[],
  ids: readonly string[],
  catalogue: CatalogueDescriptor | undefined
): string {
  const labels = new Set(
    selectedRows(rows, ids).map((row) => {
      if (row.typeId === null) return 'No type';
      return (
        catalogue?.types.find((type) => type.id === row.typeId)?.label ??
        row.typeName ??
        'Unknown type'
      );
    })
  );
  if (labels.size === 0) return 'No type information loaded';
  if (labels.size === 1) return [...labels][0] ?? 'Unknown type';
  return 'Mixed types';
}

function TypePreview({
  rows,
  action,
  targetType,
  catalogue,
}: {
  rows: readonly ItemRowModel[];
  action: BulkActionState;
  targetType: CatalogueType;
  catalogue: CatalogueDescriptor | undefined;
}): ReactElement {
  const preview = selectedRows(rows, action.ids).slice(0, 8);
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Values kept</h3>
      {preview.length > 0 ? (
        <ul className="space-y-2 text-sm">
          {preview.map((row) => {
            const kept = sharedTypeFieldLabels(row, targetType, catalogue);
            return (
              <li key={row.id} className="rounded-lg border px-3 py-2">
                <span className="font-medium">{row.name}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {kept.length === 0 ? 'No shared values' : kept.join(' · ')}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">
          No selected rows are loaded for preview.
        </p>
      )}
      {selectedRows(rows, action.ids).length > preview.length ? (
        <p className="text-xs text-muted-foreground">
          Previewing the first {preview.length} of {selectedRows(rows, action.ids).length} items.
        </p>
      ) : null}
    </div>
  );
}

function TypeSheetFooter({
  action,
  busy,
  typeKey,
  targetType,
  onOpenChange,
  onConfirm,
}: {
  action: BulkActionState;
  busy: boolean;
  typeKey: string;
  targetType: CatalogueType | undefined;
  onOpenChange: (open: boolean) => void;
  onConfirm: (typeKey: string) => Promise<void>;
}): ReactElement {
  return (
    <div className="mt-6 flex items-center justify-end gap-2 border-t pt-4">
      <Button variant="ghost" onClick={() => onOpenChange(false)}>
        Cancel
      </Button>
      <Button
        disabled={targetType === undefined || busy}
        onClick={() => {
          if (typeKey !== '') void onConfirm(typeKey);
        }}
      >
        Set type on {bulkItemCount(action.ids.length)}
      </Button>
    </div>
  );
}

/** The live sheet for replacing the selected items' catalogue type. */
export function BulkSetTypeSheet({
  action,
  rows,
  catalogue,
  busy,
  onOpenChange,
  onConfirm,
}: {
  action: BulkActionState;
  rows: readonly ItemRowModel[];
  catalogue: CatalogueDescriptor | undefined;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (typeKey: string) => Promise<void>;
}): ReactElement {
  const types = activeTypes(catalogue);
  const [typeKey, setTypeKey] = useState('');
  const targetType = types.find((type) => type.key === typeKey);
  return (
    <Sheet
      open
      onOpenChange={onOpenChange}
      title={`Set type on ${bulkItemCount(action.ids.length)}`}
      description="Choose a type. Values shared by both types stay on each item."
    >
      <div className="space-y-5">
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          {currentTypeLabel(rows, action.ids, catalogue)}{' '}
          <span className="text-muted-foreground">to</span>{' '}
          {targetType?.label ?? 'Choose a new type'}
        </p>
        <div className="space-y-2">
          <Label htmlFor="bulk-new-type">New type</Label>
          <ComboboxSelect
            id="bulk-new-type"
            aria-label="New type"
            options={types.map((type) => ({ value: type.key, label: type.label }))}
            value={typeKey}
            onChange={(value) => setTypeKey(typeof value === 'string' ? value : '')}
            placeholder="Choose the new type"
            searchPlaceholder="Search types"
            emptyMessage="No matching types"
          />
        </div>
        {targetType === undefined ? null : (
          <TypePreview rows={rows} action={action} targetType={targetType} catalogue={catalogue} />
        )}
      </div>
      <TypeSheetFooter
        action={action}
        busy={busy}
        typeKey={typeKey}
        targetType={targetType}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />
    </Sheet>
  );
}
