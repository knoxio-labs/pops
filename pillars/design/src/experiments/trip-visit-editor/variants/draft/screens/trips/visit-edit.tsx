import { VisitWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** City visit editing within its surrounding route. */
export const meta: ScreenMeta = { title: 'City visit editor', order: 13, frame: 'web' };

/** Unknown timing, approximate timing, discrepancies and unavailable city references. */
export const states: ScreenStates = {
  empty: () => <VisitWorkspace mode="draft" scenario="empty" />,
  approximate: () => <VisitWorkspace mode="draft" scenario="approximate" />,
  conflict: () => <VisitWorkspace mode="draft" scenario="conflict" />,
  'missing-reference': () => <VisitWorkspace mode="draft" scenario="missing-reference" />,
};

/** Review the draft save behaviour. */
export default function VisitEditorScreen() {
  return <VisitWorkspace mode="draft" />;
}
