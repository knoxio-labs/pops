import { ContactPickerWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Reusable contact selection and explicit quick creation inside an existing event draft. */
export const meta: ScreenMeta = { title: 'Contact picker', order: 9, frame: 'web' };

/** Fictional existing selections, blank directory, same-name identities and unavailable links. */
export const states: ScreenStates = {
  default: () => <ContactPickerWorkspace layout="inline" />,
  empty: () => <ContactPickerWorkspace layout="inline" scenario="empty" />,
  'duplicate-names': () => <ContactPickerWorkspace layout="inline" scenario="duplicate-names" />,
  'missing-reference': () => (
    <ContactPickerWorkspace layout="inline" scenario="missing-reference" />
  ),
  business: () => <ContactPickerWorkspace layout="inline" scenario="business" />,
};

/** Opens the inline picker with identical source facts and selected contacts. */
export default function ContactPickerScreen() {
  return <ContactPickerWorkspace layout="inline" />;
}
