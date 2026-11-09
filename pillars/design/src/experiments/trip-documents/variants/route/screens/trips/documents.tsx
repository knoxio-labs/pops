import { useSearchParams } from 'react-router';

import { TripDocumentsWorkspace } from '../../../../workspace';

import type { ScreenMeta } from '@/contract';

export const meta: ScreenMeta = { title: 'Trip documents' };

/** Render the selected document proposal with a named fictional source state. */
export default function Screen() {
  const [params] = useSearchParams();
  const state = params.get('state');
  const scenario =
    state === 'empty' ||
    state === 'unavailable' ||
    state === 'missing-reference' ||
    state === 'offline' ||
    state === 'duplicate-names'
      ? state
      : 'default';
  return <TripDocumentsWorkspace layout="route" scenario={scenario} />;
}
