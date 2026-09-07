import type { CaptureStatus } from '@/fixtures/purchases-everyday-export';

export interface PopupGuidance {
  text: string;
  isError: boolean;
}

export interface PopupDisabled {
  history: boolean;
  fetch: boolean;
  download: boolean;
}

/**
 * Which message the popup shows, and whether it is an error.
 *
 * Checked in the order a user runs into them: an error outranks everything,
 * including a run in progress; short of an error, a run in progress explains
 * itself before anything else; and the two missing templates are reported
 * before "ready" so a disabled button always says why it is disabled.
 */
export function popupGuidance(status: CaptureStatus): PopupGuidance {
  if (status.error !== null) return { text: status.error, isError: true };
  if (status.running === 'history') {
    return {
      text: `Loading history — ${status.progress.done} receipts listed so far…`,
      isError: false,
    };
  }
  if (status.running === 'receipts') {
    return {
      text: `Fetching ${status.progress.done} of ${status.progress.total}…`,
      isError: false,
    };
  }
  if (!status.hasPageTemplate) {
    return {
      text: 'Scroll the activity list once — that is where the pagination request comes from.',
      isError: false,
    };
  }
  if (!status.hasDetailsTemplate) {
    return {
      text: 'Open any one receipt — that teaches the extension the request it replays for the rest.',
      isError: false,
    };
  }
  if (status.moreHistory) {
    return { text: 'Load your full history first, then fetch the receipts.', isError: false };
  }
  if (status.pending > 0) {
    return { text: 'Ready. Fetching takes about a second per receipt.', isError: false };
  }
  return { text: 'Every listed receipt has been captured.', isError: false };
}

/** Whether each button is disabled, from the same status object. */
export function popupDisabled(status: CaptureStatus): PopupDisabled {
  const idle = status.running === null;
  return {
    history: !(idle && status.hasPageTemplate && status.moreHistory),
    fetch: !(idle && status.hasDetailsTemplate && status.pending > 0),
    download: !(idle && status.captured > 0),
  };
}
