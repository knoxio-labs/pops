import {
  bothTaught,
  captureComplete,
  captureFailed,
  fetchingReceipts,
  historyLoaded,
  listScrolled,
  untaught,
  type CaptureStatus,
} from '@/fixtures/purchases-everyday-export';
import { popupDisabled, popupGuidance } from '@/kit/purchases/extension/popup-guidance';
import { describe, expect, it } from 'vitest';

describe('popupGuidance', () => {
  it('reports an error ahead of a run still in progress', () => {
    const stalled: CaptureStatus = { ...fetchingReceipts, error: 'the site answered HTTP 401' };
    expect(popupGuidance(stalled)).toEqual({
      text: 'the site answered HTTP 401',
      isError: true,
    });
  });

  it('reports a history walk without a total, which it does not know yet', () => {
    const guidance = popupGuidance({
      ...bothTaught,
      running: 'history',
      progress: { done: 186, total: 0 },
    });
    expect(guidance.text).toBe('Loading history — 186 receipts listed so far…');
    expect(guidance.isError).toBe(false);
  });

  it('counts a receipt fetch against its total', () => {
    expect(popupGuidance(fetchingReceipts).text).toBe('Fetching 137 of 412…');
  });

  it('names the missing pagination request before the missing receipt request', () => {
    expect(popupGuidance(untaught).text).toMatch(/^Scroll the activity list once/u);
  });

  it('names the missing receipt request once the list has been scrolled', () => {
    expect(popupGuidance(listScrolled).text).toMatch(/^Open any one receipt/u);
  });

  it('sends the reader to the history walk before the fetch', () => {
    expect(popupGuidance(bothTaught).text).toBe(
      'Load your full history first, then fetch the receipts.'
    );
  });

  it('is ready once the history is walked and rows are outstanding', () => {
    expect(popupGuidance(historyLoaded).text).toMatch(/^Ready\./u);
  });

  it('says the capture is done when nothing is pending', () => {
    expect(popupGuidance(captureComplete).text).toBe('Every listed receipt has been captured.');
  });
});

describe('popupDisabled', () => {
  it('disables everything before either request has been taught', () => {
    expect(popupDisabled(untaught)).toEqual({ history: true, fetch: true, download: true });
  });

  it('enables only the history walk while the pagination request is all it knows', () => {
    expect(popupDisabled(listScrolled)).toEqual({ history: false, fetch: true, download: true });
  });

  it('disables every button while a run is in progress', () => {
    expect(popupDisabled(fetchingReceipts)).toEqual({
      history: true,
      fetch: true,
      download: true,
    });
  });

  it('re-enables download after a failed run that captured something', () => {
    expect(popupDisabled(captureFailed)).toEqual({
      history: true,
      fetch: false,
      download: false,
    });
  });

  it('refuses a fetch with nothing pending, and still offers the download', () => {
    expect(popupDisabled(captureComplete)).toEqual({
      history: true,
      fetch: true,
      download: false,
    });
  });

  it('refuses a history walk once the cursor is exhausted', () => {
    expect(popupDisabled(historyLoaded).history).toBe(true);
  });
});
