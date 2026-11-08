import { DirectoryWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Find people and other entities while preserving existing finance identities. */
export const meta: ScreenMeta = { title: 'Contacts directory', order: 15, frame: 'web' };
/** Review empty, sparse and duplicate-name directories without inventing missing facts. */
export const states: ScreenStates = {
  empty: () => <DirectoryWorkspace layout="combined" scenario="empty" />,
  sparse: () => <DirectoryWorkspace layout="combined" scenario="sparse" />,
  'duplicate-names': () => <DirectoryWorkspace layout="combined" scenario="duplicate-names" />,
};
/** Compare the combined contact result organisation. */
export default function DirectoryScreen() {
  return <DirectoryWorkspace layout="combined" />;
}
