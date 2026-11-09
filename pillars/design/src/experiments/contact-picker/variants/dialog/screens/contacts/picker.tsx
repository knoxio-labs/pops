import { ContactPickerWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Reusable contact selection and explicit quick creation inside an existing event draft. */
export const meta: ScreenMeta = { title: 'Contact picker', order: 9, frame: 'web' };

/** Fictional existing selections, blank directory, same-name identities and unavailable links. */
export const states: ScreenStates = {
  default: () => <ContactPickerWorkspace layout="dialog" />,
  empty: () => <ContactPickerWorkspace layout="dialog" scenario="empty" />,
  'duplicate-names': () => <ContactPickerWorkspace layout="dialog" scenario="duplicate-names" />,
  'missing-reference': () => (
    <ContactPickerWorkspace layout="dialog" scenario="missing-reference" />
  ),
  business: () => <ContactPickerWorkspace layout="dialog" scenario="business" />,
};

/** Opens the dialog picker with identical source facts and selected contacts. */
export default function ContactPickerScreen() {
  return <ContactPickerWorkspace layout="dialog" />;
}
