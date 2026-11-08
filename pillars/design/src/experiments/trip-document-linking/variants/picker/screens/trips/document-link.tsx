import { DocumentWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Link Documents originals to a trip or an existing route item. */
export const meta: ScreenMeta = {
  title: 'Document attachment and linking',
  order: 14,
  frame: 'web',
};
/** Empty, unavailable and unresolved reference states use the same linking controls. */
export const states: ScreenStates = {
  empty: () => <DocumentWorkspace layout="picker" scenario="empty" />,
  unavailable: () => <DocumentWorkspace layout="picker" scenario="unavailable" />,
  'missing-reference': () => <DocumentWorkspace layout="picker" scenario="missing-reference" />,
};
/** Review the picker document selection flow. */
export default function DocumentScreen() {
  return <DocumentWorkspace layout="picker" />;
}
