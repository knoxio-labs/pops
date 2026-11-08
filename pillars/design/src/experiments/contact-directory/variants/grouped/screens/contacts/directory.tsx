import { DirectoryWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Find people and other entities while preserving existing finance identities. */
export const meta: ScreenMeta = { title: 'Contacts directory', order: 15, frame: 'web' };
/** Review empty, sparse and duplicate-name directories without inventing missing facts. */
export const states: ScreenStates = {
  empty: () => <DirectoryWorkspace layout="grouped" scenario="empty" />,
  sparse: () => <DirectoryWorkspace layout="grouped" scenario="sparse" />,
  'duplicate-names': () => <DirectoryWorkspace layout="grouped" scenario="duplicate-names" />,
};
/** Compare the grouped contact result organisation. */
export default function DirectoryScreen() {
  return <DirectoryWorkspace layout="grouped" />;
}
