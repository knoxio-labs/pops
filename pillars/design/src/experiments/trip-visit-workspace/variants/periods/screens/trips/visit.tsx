import { VisitWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Organise one visit through accommodation intervals while retaining the surrounding route. */
export const meta: ScreenMeta = { title: 'City / visit workspace', order: 3, frame: 'web' };

/** Review incomplete and conflicting source data with the same editing controls. */
export const states: ScreenStates = {
  empty: () => <VisitWorkspace layout="periods" scenario="empty" />,
  approximate: () => <VisitWorkspace layout="periods" scenario="approximate" />,
  'overlapping-stays': () => <VisitWorkspace layout="periods" scenario="overlap" />,
  'repeat-visit': () => <VisitWorkspace layout="periods" scenario="repeat-visit" />,
};

/** Stay-first proposal; source edits and undo apply to every projection. */
export default function VisitScreen() {
  return <VisitWorkspace layout="periods" />;
}
