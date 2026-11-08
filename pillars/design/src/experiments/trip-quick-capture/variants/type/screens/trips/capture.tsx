import { CaptureWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Minimal source capture with optional context and later enrichment. */
export const meta: ScreenMeta = { title: 'Quick capture', order: 6, frame: 'web' };

/** Review empty capture, whole links, actual files and unavailable references. */
export const states: ScreenStates = {
  empty: () => <CaptureWorkspace layout="type" scenario="empty" />,
  link: () => <CaptureWorkspace layout="type" scenario="link" />,
  document: () => <CaptureWorkspace layout="type" scenario="document" />,
  'missing-reference': () => <CaptureWorkspace layout="type" scenario="missing-reference" />,
};

/** Comparable capture workflow; approval remains a user decision. */
export default function CaptureScreen() {
  return <CaptureWorkspace layout="type" />;
}
