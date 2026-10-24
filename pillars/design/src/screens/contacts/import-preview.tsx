import { ImportPreview, previewStates } from '@/experiments/contacts-import-review/preview';

import type { ScreenMeta } from '@/contract';

/** File and provider preview before any contact is written. */
export const meta: ScreenMeta = { title: 'Import preview', order: 4, frame: 'web' };
/** File parsing and source boundaries. */
export const states = previewStates;
/** Stages the same six fictional identities used in duplicate review. */
export default function ImportPreviewScreen() {
  return <ImportPreview />;
}
