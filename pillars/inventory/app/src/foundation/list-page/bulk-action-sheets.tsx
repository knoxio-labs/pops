import { LifecycleDialog } from '../lifecycle/lifecycle-dialog.js';
import { BulkSetFieldSheet } from './bulk-set-field-sheet.js';
import { BulkSetTypeSheet } from './bulk-set-type-sheet.js';

import type { ReactElement } from 'react';

import type { CatalogueDescriptor } from '../../inventory-web/useCatalogueLookups.js';
import type { ItemRowModel } from '../model/model.js';
import type { BulkFieldInput } from './bulk-action-model.js';
import type { BulkActionKind, BulkActionState } from './bulk-action-types.js';

export type { BulkActionKind, BulkActionState } from './bulk-action-types.js';
export type { BulkFieldInput } from './bulk-action-model.js';

/** Props for the live bulk action sheets and lifecycle dialog. */
export interface BulkActionSheetsProps {
  readonly action: BulkActionState | null;
  readonly rows: readonly ItemRowModel[];
  readonly catalogue: CatalogueDescriptor | undefined;
  readonly busy: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSetType: (typeKey: string) => Promise<void>;
  readonly onSetField: (fieldId: string, input: BulkFieldInput) => Promise<void>;
  readonly onLifecycle: (
    act: Extract<BulkActionKind, 'retire' | 'discard'>,
    reason: string | null
  ) => Promise<void>;
}

/** Renders the live sheets for typed bulk actions and the shared lifecycle dialog. */
export function BulkActionSheets({
  action,
  rows,
  catalogue,
  busy,
  onOpenChange,
  onSetType,
  onSetField,
  onLifecycle,
}: BulkActionSheetsProps): ReactElement | null {
  if (action === null) return null;
  if (action.kind === 'set-type') {
    return (
      <BulkSetTypeSheet
        action={action}
        rows={rows}
        catalogue={catalogue}
        busy={busy}
        onOpenChange={onOpenChange}
        onConfirm={onSetType}
      />
    );
  }
  if (action.kind === 'set-field') {
    return (
      <BulkSetFieldSheet
        action={action}
        rows={rows}
        catalogue={catalogue}
        busy={busy}
        onOpenChange={onOpenChange}
        onConfirm={onSetField}
      />
    );
  }
  const lifecycle = action.kind;
  return (
    <LifecycleDialog
      act={lifecycle}
      subject={action.ids.length}
      open
      onOpenChange={onOpenChange}
      onConfirm={(reason) => void onLifecycle(lifecycle, reason)}
    />
  );
}
