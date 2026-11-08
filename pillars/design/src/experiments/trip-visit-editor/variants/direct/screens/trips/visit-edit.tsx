import { VisitWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** City visit editing within its surrounding route. */
export const meta: ScreenMeta = { title: 'City visit editor', order: 13, frame: 'web' };

/** Unknown timing, approximate timing, discrepancies and unavailable city references. */
export const states: ScreenStates = {
  empty: () => <VisitWorkspace mode="direct" scenario="empty" />,
  approximate: () => <VisitWorkspace mode="direct" scenario="approximate" />,
  conflict: () => <VisitWorkspace mode="direct" scenario="conflict" />,
  'missing-reference': () => <VisitWorkspace mode="direct" scenario="missing-reference" />,
};

/** Review the direct save behaviour. */
export default function VisitEditorScreen() {
  return <VisitWorkspace mode="direct" />;
}
