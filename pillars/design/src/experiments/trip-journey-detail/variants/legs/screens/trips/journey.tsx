import { JourneyWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Editable multi-leg transport with local clocks and booking references. */
export const meta: ScreenMeta = { title: 'Journey detail', order: 8, frame: 'web' };

/** Review open transport, overnight boundaries, short connections and unavailable references. */
export const states: ScreenStates = {
  empty: () => <JourneyWorkspace layout="legs" scenario="empty" />,
  overnight: () => <JourneyWorkspace layout="legs" scenario="overnight" />,
  'tight-connection': () => <JourneyWorkspace layout="legs" scenario="tight-connection" />,
  'missing-reference': () => <JourneyWorkspace layout="legs" scenario="missing-reference" />,
};

/** Comparable prototype; selecting and approving its layout remains a user decision. */
export default function JourneyScreen() {
  return <JourneyWorkspace layout="legs" />;
}
