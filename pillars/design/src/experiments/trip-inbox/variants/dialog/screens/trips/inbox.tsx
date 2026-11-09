import { useSearchParams } from 'react-router';

import { InboxWorkspace } from '../../../../workspace';

import type { ScreenMeta } from '@/contract';

export const meta: ScreenMeta = { title: 'Trip inbox' };

/** Render the selected Inbox proposal with a named fictional source state. */
export default function Screen() {
  const [params] = useSearchParams();
  const state = params.get('state');
  const scenario =
    state === 'empty' ||
    state === 'organised' ||
    state === 'missing-reference' ||
    state === 'files' ||
    state === 'duplicate-names'
      ? state
      : 'default';
  return <InboxWorkspace layout="dialog" scenario={scenario} />;
}
