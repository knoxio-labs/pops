import { ContactEditor, editorStates } from '@/experiments/contacts-import-review/editor';

import type { ScreenMeta } from '@/contract';

/** Compact editing arrangement uses the same identity and source retention policy. */
export const meta: ScreenMeta = { title: 'Person editor', order: 2, frame: 'web' };
/** Shared editor boundaries. */
export const states = editorStates;
/** Stages editing alongside the compare review arrangement. */
export default function PersonEditorVariant() {
  return <ContactEditor layout="compact" />;
}
