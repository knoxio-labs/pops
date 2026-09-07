/**
 * The status the Everyday Rewards capture extension reports to its popup,
 * shaped like the frozen `status()` its content script publishes.
 *
 * The popup holds no state of its own — it is a remote control for the
 * content script — so one status object is the whole input to everything the
 * popup can get wrong.
 */
export interface CaptureStatus {
  /** Rows seen in the activity list. */
  listed: number;
  /** Rows whose receipt has been fetched. */
  captured: number;
  /** Listed rows still owed a receipt. */
  pending: number;
  /** The replayable receipt request, learned by opening one receipt. */
  hasDetailsTemplate: boolean;
  /** The replayable pagination request, learned by scrolling the list once. */
  hasPageTemplate: boolean;
  /** No list read yet, or a cursor still outstanding. */
  moreHistory: boolean;
  running: 'history' | 'receipts' | null;
  progress: { done: number; total: number };
  error: string | null;
}

const IDLE: CaptureStatus = {
  listed: 0,
  captured: 0,
  pending: 0,
  hasDetailsTemplate: false,
  hasPageTemplate: false,
  moreHistory: true,
  running: null,
  progress: { done: 0, total: 0 },
  error: null,
};

/** Nothing scrolled and nothing opened: the extension knows neither request. */
export const untaught: CaptureStatus = { ...IDLE };

/** The list was scrolled once, so pagination can be replayed. */
export const listScrolled: CaptureStatus = {
  ...IDLE,
  listed: 24,
  pending: 24,
  hasPageTemplate: true,
};

/** A receipt was opened too, but the history is not walked to the end yet. */
export const bothTaught: CaptureStatus = {
  ...listScrolled,
  hasDetailsTemplate: true,
};

export const walkingHistory: CaptureStatus = {
  ...bothTaught,
  running: 'history',
  progress: { done: 186, total: 0 },
};

/** Walked to the end: 412 rows listed, none fetched. */
export const historyLoaded: CaptureStatus = {
  ...bothTaught,
  listed: 412,
  pending: 412,
  moreHistory: false,
};

export const fetchingReceipts: CaptureStatus = {
  ...historyLoaded,
  captured: 137,
  pending: 275,
  running: 'receipts',
  progress: { done: 137, total: 412 },
};

/**
 * Done, and short of the row count: not every listed row has a receipt, and
 * a row without one is only ever asked about once.
 */
export const captureComplete: CaptureStatus = {
  ...historyLoaded,
  captured: 388,
  pending: 0,
};

export const captureFailed: CaptureStatus = {
  ...fetchingReceipts,
  running: null,
  error: 'Stopped after 137 — the site answered HTTP 401 — reload the page and start again',
};
