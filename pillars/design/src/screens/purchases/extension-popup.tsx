import {
  bothTaught,
  captureComplete,
  captureFailed,
  fetchingReceipts,
  historyLoaded,
  listScrolled,
  untaught,
  walkingHistory,
} from '@/fixtures/purchases-everyday-export';
import { CapturePopup } from '@/kit/purchases/extension/popup';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { CaptureStatus } from '@/fixtures/purchases-everyday-export';

export const meta: ScreenMeta = { title: 'Capture popup', order: 6, frame: 'none' };

/**
 * The Everyday Rewards export extension's popup — the only purchases surface
 * that ships outside the shell, and so the only one with no chrome to sit in.
 *
 * Woolworths offers no export, so the receipts are read out of the logged-in
 * session by an unpacked Chrome extension. The popup is a remote control with
 * no state of its own: every state below is one status object from the
 * content script, which is why a disabled button always has a message saying
 * why.
 */
function Popup({ status }: { status: CaptureStatus | null }) {
  return (
    <div className="bg-muted/40 flex min-h-screen items-start justify-center p-8">
      <CapturePopup status={status} />
    </div>
  );
}

export default function CapturePopupScreen() {
  return <Popup status={historyLoaded} />;
}

export const states: ScreenStates = {
  detached: () => <Popup status={null} />,
  untaught: () => <Popup status={untaught} />,
  'list-scrolled': () => <Popup status={listScrolled} />,
  'both-taught': () => <Popup status={bothTaught} />,
  'walking-history': () => <Popup status={walkingHistory} />,
  fetching: () => <Popup status={fetchingReceipts} />,
  complete: () => <Popup status={captureComplete} />,
  failed: () => <Popup status={captureFailed} />,
};
