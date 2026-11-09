import { ContactEditorWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Contact create and edit comparison with a bounded vertical form. */
export const meta: ScreenMeta = { title: 'Create and edit contact', order: 7, frame: 'web' };

/** Identical fictional create, edit, business, duplicate and partial-record states. */
export const states: ScreenStates = {
  default: () => <ContactEditorWorkspace layout="full" scenario="new" />,
  new: () => <ContactEditorWorkspace layout="full" scenario="new" />,
  edit: () => <ContactEditorWorkspace layout="full" scenario="edit" />,
  business: () => <ContactEditorWorkspace layout="full" scenario="business" />,
  duplicate: () => <ContactEditorWorkspace layout="full" scenario="duplicate" />,
  sparse: () => <ContactEditorWorkspace layout="full" scenario="sparse" />,
};

/** Opens the full optional-section proposal. */
export default function ContactEditorScreen() {
  return <ContactEditorWorkspace layout="full" />;
}
