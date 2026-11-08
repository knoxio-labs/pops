import { StayWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Hotel and hosted accommodation with local dates and reusable references. */
export const meta: ScreenMeta = { title: 'Stay detail', order: 9, frame: 'web' };

/** Review blank, family, overlap and unavailable-reference source states. */
export const states: ScreenStates = {
  empty: () => <StayWorkspace layout="visit" scenario="empty" />,
  family: () => <StayWorkspace layout="visit" scenario="family" />,
  overlap: () => <StayWorkspace layout="visit" scenario="overlap" />,
  'missing-reference': () => <StayWorkspace layout="visit" scenario="missing-reference" />,
};

/** Comparable stay editor; layout approval remains a user decision. */
export default function StayScreen() {
  return <StayWorkspace layout="visit" />;
}
