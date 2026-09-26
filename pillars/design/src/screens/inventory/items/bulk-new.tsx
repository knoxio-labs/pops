import {
  bulkContext,
  cleanRows,
  pasted,
  treeTypedRows,
  typedRows,
} from '@/fixtures/inventory/bulk-entry';
import { coreWorld } from '@/fixtures/inventory/core';
import { typeOptions } from '@/fixtures/inventory/items-browse';
import { BulkPage } from '@/kit/inventory/bulk-entry/bulk-page';
import { settle } from '@/kit/inventory/bulk-entry/row-validation';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { BulkPageProps } from '@/kit/inventory/bulk-entry/bulk-page';
import type { ReactNode } from 'react';

export const meta: ScreenMeta = { title: 'Bulk entry', order: 16, frame: 'web' };

const pasteNote = `Read a header row. The Colour column is not an item field and was left out.`;
const afterSubmit = settle(pasted.rows, bulkContext);

function Bulk(props: Partial<BulkPageProps>): ReactNode {
  return (
    <BulkPage
      phase="editing"
      rows={typedRows}
      context={bulkContext}
      world={coreWorld}
      destination={{ kind: 'location', locationId: 'loc-kitchen' }}
      types={typeOptions}
      pasteNote={pasteNote}
      {...props}
    />
  );
}

/**
 * `/inventory/items/bulk-new` (Shift-N): many items in one grid. Partial
 * accept (owner decision 3): Create adds the ready rows and keeps the rest
 * here with their reasons, so there is no all-or-nothing failure state.
 */
export const states: ScreenStates = {
  editing: () => <Bulk />,
  pasted: () => <Bulk phase="pasted" rows={cleanRows} />,
  validating: () => <Bulk phase="validating" rows={pasted.rows} />,
  'has-errors': () => <Bulk phase="has-errors" rows={pasted.rows} />,
  'type-cell-tree': () => <Bulk rows={treeTypedRows} typeTreeOpen typeTreeQuery="sheet" />,
  submitting: () => <Bulk phase="submitting" rows={cleanRows} />,
  'partial-created': () => (
    <Bulk
      phase="partial-created"
      rows={afterSubmit.remaining}
      created={afterSubmit.created.length}
    />
  ),
  created: () => <Bulk phase="created" rows={[]} created={cleanRows.length} />,
};

export default function BulkNewScreen(): ReactNode {
  return <Bulk />;
}
