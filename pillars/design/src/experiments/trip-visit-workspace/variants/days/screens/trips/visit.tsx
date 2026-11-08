import { VisitWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Organise one visit through calendar days while retaining the surrounding route. */
export const meta: ScreenMeta = { title: 'City / visit workspace', order: 3, frame: 'web' };

/** Review incomplete and conflicting source data with the same editing controls. */
export const states: ScreenStates = {
  empty: () => <VisitWorkspace layout="days" scenario="empty" />,
  approximate: () => <VisitWorkspace layout="days" scenario="approximate" />,
  'overlapping-stays': () => <VisitWorkspace layout="days" scenario="overlap" />,
  'repeat-visit': () => <VisitWorkspace layout="days" scenario="repeat-visit" />,
};

/** Day-first proposal; source edits and undo apply to every projection. */
export default function VisitScreen() {
  return <VisitWorkspace layout="days" />;
}
