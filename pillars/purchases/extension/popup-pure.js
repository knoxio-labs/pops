/**
 * Popup decisions, with nothing the popup does.
 *
 * Split out from `popup.js` so it can be tested without a browser, the same
 * way `pure.js` is split out from `observe.js`/`capture.js`. The popup is a
 * remote control with no state of its own, so everything it can get wrong —
 * which buttons are enabled, and which message explains why — is a pure
 * function of the one status object `window.__popsEveryday.status()`
 * returns.
 */

/**
 * Which message to show, and whether it is an error.
 *
 * Checked in the order a user runs into them: an error outranks everything,
 * including a run in progress; short of an error, a run in progress explains
 * itself before anything else does; and the two missing templates are
 * reported before "ready" so a disabled button always says why. Getting
 * this wrong sends the user scrolling a list that does not need scrolling,
 * which is how it was got wrong while this extension was being built.
 */
function popsPopupGuidance(status) {
  if (status.error) return [status.error, true];
  if (status.running === 'history') {
    return [`Loading history — ${String(status.progress.done)} receipts listed so far…`];
  }
  if (status.running === 'receipts') {
    return [`Fetching ${String(status.progress.done)} of ${String(status.progress.total)}…`];
  }
  if (!status.hasPageTemplate) {
    return ['Scroll the activity list once — that is where the pagination request comes from.'];
  }
  if (!status.hasDetailsTemplate) {
    return [
      'Open any one receipt — that teaches the extension the request it replays for the rest.',
    ];
  }
  if (status.moreHistory) return ['Load your full history first, then fetch the receipts.'];
  if (status.pending > 0) return ['Ready. Fetching takes about a second per receipt.'];
  return ['Every listed receipt has been captured.'];
}

/** Whether each button should be disabled, from the same status object. */
function popsPopupDisabled(status) {
  const idle = status.running === null;
  return {
    history: !(idle && status.hasPageTemplate && status.moreHistory),
    fetch: !(idle && status.hasDetailsTemplate && status.pending > 0),
    download: !(idle && status.captured > 0),
  };
}

const popsPopupPure = { guidance: popsPopupGuidance, disabledFor: popsPopupDisabled };

// `popup.js` runs as a separate classic script, so this is how it reaches
// these. Declared as well as published, the same way `pure.js` does it, so
// the bare identifier is a real binding rather than a global-object property
// that only some evaluation contexts hand back.
globalThis.popsPopupPure = popsPopupPure;
