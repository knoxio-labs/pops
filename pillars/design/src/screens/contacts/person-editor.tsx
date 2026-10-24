import { ContactEditor, editorStates } from '@/experiments/contacts-import-review/editor';

import type { ScreenMeta } from '@/contract';

/** Person editing proposal with stacked sections and a compact alternative state. */
export const meta: ScreenMeta = { title: 'Person editor', order: 2, frame: 'web' };
/** Includes creation and failure conditions. */
export const states = editorStates;
/** Stages person details without changing production records. */
export default function PersonEditorScreen() {
  return <ContactEditor layout="sections" />;
}
