import { bulkContext } from '@/fixtures/inventory/bulk-entry';
import { importFile, importHeaders, importMapping, importRows } from '@/fixtures/inventory/import';
import { guessMapping } from '@/kit/inventory/import/import-model';
import { ImportPage } from '@/kit/inventory/import/import-page';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { ColumnTarget } from '@/kit/inventory/import/import-model';
import type { ImportPageProps } from '@/kit/inventory/import/import-page';
import type { ReactNode } from 'react';

export const meta: ScreenMeta = { title: 'Import CSV', order: 17, frame: 'web' };

function Import(props: Partial<ImportPageProps>): ReactNode {
  return (
    <ImportPage
      phase="upload"
      file={importFile}
      headers={importHeaders}
      rows={importRows}
      mapping={importMapping}
      context={bulkContext}
      {...props}
    />
  );
}

const BROKEN_TARGETS: Readonly<Record<string, ColumnTarget>> = { Item: 'skip', Label: 'quantity' };

const brokenMapping = importMapping.map((column) => ({
  ...column,
  target: BROKEN_TARGETS[column.header] ?? column.target,
}));

/**
 * `/inventory/import`: a spreadsheet in. Export lives on Items (Export,
 * `export-menu` state there) and writes the same columns this reads.
 */
export const states: ScreenStates = {
  upload: () => <Import />,
  'upload-refused': () => <Import refused="garage-inventory-2025.xlsx" />,
  mapping: () => <Import phase="mapping" />,
  'mapping-guessed': () => <Import phase="mapping" mapping={guessMapping(importHeaders)} />,
  'mapping-problem': () => <Import phase="mapping" mapping={brokenMapping} />,
  preview: () => <Import phase="preview" />,
  'preview-errors': () => <Import phase="preview" onlyProblems />,
  committing: () => <Import phase="committing" />,
  done: () => <Import phase="done" />,
};

export default function ImportScreen(): ReactNode {
  return <Import />;
}
