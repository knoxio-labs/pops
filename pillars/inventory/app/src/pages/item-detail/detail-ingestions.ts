import { titleCase } from './detail-sections';

import type { DocumentsListForItemResponse } from '../../inventory-api/types.gen.js';
import type { DetailIngestion } from './detail-model-types';

/** Maps pending or failed upload rows into the detail model. */
export function toDetailIngestions(
  rows: DocumentsListForItemResponse['pending'] | DocumentsListForItemResponse['failed']
): DetailIngestion[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title ?? row.fileName,
    kind: titleCase(row.documentType),
    reason: row.reason,
  }));
}
