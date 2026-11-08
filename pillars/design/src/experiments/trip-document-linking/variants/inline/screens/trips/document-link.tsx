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
  empty: () => <DocumentWorkspace layout="inline" scenario="empty" />,
  unavailable: () => <DocumentWorkspace layout="inline" scenario="unavailable" />,
  'missing-reference': () => <DocumentWorkspace layout="inline" scenario="missing-reference" />,
};
/** Review the inline document selection flow. */
export default function DocumentScreen() {
  return <DocumentWorkspace layout="inline" />;
}
