import { ContactEditorWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Contact create and edit comparison with a bounded vertical form. */
export const meta: ScreenMeta = { title: 'Create and edit contact', order: 7, frame: 'web' };

/** Identical fictional create, edit, business, duplicate and partial-record states. */
export const states: ScreenStates = {
  default: () => <ContactEditorWorkspace layout="progressive" scenario="new" />,
  new: () => <ContactEditorWorkspace layout="progressive" scenario="new" />,
  edit: () => <ContactEditorWorkspace layout="progressive" scenario="edit" />,
  business: () => <ContactEditorWorkspace layout="progressive" scenario="business" />,
  duplicate: () => <ContactEditorWorkspace layout="progressive" scenario="duplicate" />,
  sparse: () => <ContactEditorWorkspace layout="progressive" scenario="sparse" />,
};

/** Opens the progressive optional-section proposal. */
export default function ContactEditorScreen() {
  return <ContactEditorWorkspace layout="progressive" />;
}
