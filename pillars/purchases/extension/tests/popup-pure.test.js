/**
 * The popup's decisions, tested.
 *
 * `popup-pure.js` is loaded by `popup.html` as a classic script, so it has
 * no exports to import. As with `pure.test.js`, it is evaluated here exactly
 * as the browser evaluates it, and the bindings are lifted out afterwards.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

import { beforeAll, describe, expect, it } from 'vitest';

let popup;

beforeAll(() => {
  const source = readFileSync(fileURLToPath(new URL('../popup-pure.js', import.meta.url)), 'utf8');
  const context = createContext({});
  popup = runInContext(`${source}\npopsPopupPure;`, context);
});

/**
 * A status object shaped like `window.__popsEveryday.status()`, with
 * sensible defaults for "idle, everything already learned, nothing to do" —
 * every test overrides only what it needs to make its point.
 */
const status = (overrides = {}) => ({
  listed: 0,
  captured: 0,
  pending: 0,
  hasDetailsTemplate: true,
  hasPageTemplate: true,
  moreHistory: false,
  running: null,
  progress: { done: 0, total: 0 },
  error: null,
  ...overrides,
});

describe('guidance', () => {
  it('leads with the error, over a run in progress or anything else', () => {
    const [text, isError] = popup.guidance(
      status({
        error: 'the site answered HTTP 401 — reload the page and start again',
        running: 'history',
      })
    );
    expect(text).toBe('the site answered HTTP 401 — reload the page and start again');
    expect(isError).toBe(true);
  });

  it('reports progress while history is loading', () => {
    const [text, isError] = popup.guidance(
      status({ running: 'history', progress: { done: 12, total: 0 } })
    );
    expect(text).toBe('Loading history — 12 receipts listed so far…');
    expect(isError).toBeUndefined();
  });

  it('reports progress while receipts are fetching', () => {
    const [text] = popup.guidance(
      status({ running: 'receipts', progress: { done: 3, total: 40 } })
    );
    expect(text).toBe('Fetching 3 of 40…');
  });

  it('asks for a scroll when there is no page template yet', () => {
    const [text] = popup.guidance(status({ hasPageTemplate: false }));
    expect(text).toBe(
      'Scroll the activity list once — that is where the pagination request comes from.'
    );
  });

  it('asks to open a receipt when there is no details template yet, even with a page template', () => {
    const [text] = popup.guidance(status({ hasPageTemplate: true, hasDetailsTemplate: false }));
    expect(text).toBe(
      'Open any one receipt — that teaches the extension the request it replays for the rest.'
    );
  });

  it('asks to finish loading history before fetching, once both templates exist', () => {
    const [text] = popup.guidance(status({ moreHistory: true, pending: 5 }));
    expect(text).toBe('Load your full history first, then fetch the receipts.');
  });

  it('says ready when there is work pending and nothing left to learn', () => {
    const [text] = popup.guidance(status({ pending: 5 }));
    expect(text).toBe('Ready. Fetching takes about a second per receipt.');
  });

  it('says everything is captured, and does not send the user back to scrolling', () => {
    // THE POPS-239 regression: a status that means "nothing left to capture"
    // must not produce the "scroll for more" message. Both templates are
    // already known, history is exhausted, and nothing is pending — the only
    // reading left is that the job is done.
    const [text, isError] = popup.guidance(
      status({ listed: 5, captured: 5, pending: 0, moreHistory: false })
    );
    expect(text).toBe('Every listed receipt has been captured.');
    expect(text).not.toMatch(/scroll/i);
    expect(isError).toBeUndefined();
  });
});

describe('disabledFor', () => {
  it('disables every button while a run is in progress, regardless of state', () => {
    const disabled = popup.disabledFor(
      status({
        running: 'receipts',
        hasPageTemplate: true,
        moreHistory: true,
        hasDetailsTemplate: true,
        pending: 5,
        captured: 5,
      })
    );
    expect(disabled).toEqual({ history: true, fetch: true, download: true });
  });

  it('enables "load history" only once the page template exists and there is more history', () => {
    expect(popup.disabledFor(status({ hasPageTemplate: false, moreHistory: true })).history).toBe(
      true
    );
    expect(popup.disabledFor(status({ hasPageTemplate: true, moreHistory: false })).history).toBe(
      true
    );
    expect(popup.disabledFor(status({ hasPageTemplate: true, moreHistory: true })).history).toBe(
      false
    );
  });

  it('enables "fetch" only once the details template exists and something is pending', () => {
    expect(popup.disabledFor(status({ hasDetailsTemplate: false, pending: 5 })).fetch).toBe(true);
    expect(popup.disabledFor(status({ hasDetailsTemplate: true, pending: 0 })).fetch).toBe(true);
    expect(popup.disabledFor(status({ hasDetailsTemplate: true, pending: 5 })).fetch).toBe(false);
  });

  it('enables "download" only once something has been captured', () => {
    expect(popup.disabledFor(status({ captured: 0 })).download).toBe(true);
    expect(popup.disabledFor(status({ captured: 1 })).download).toBe(false);
  });
});

describe('pairing guidance with button state', () => {
  /**
   * Each row is a status a real popup can be in, with what both functions
   * must say about it. This is the regression `guidance` and `disabledFor`
   * both exist to prevent: a message that does not match which buttons are
   * actually live, which is what sent a user scrolling a list that did not
   * need scrolling during POPS-239 development.
   */
  const cases = [
    {
      name: 'fresh page, nothing observed yet',
      status: status({ hasPageTemplate: false, hasDetailsTemplate: false }),
      text: 'Scroll the activity list once — that is where the pagination request comes from.',
      disabled: { history: true, fetch: true, download: true },
    },
    {
      name: 'scrolled, no receipt opened yet, more history still to load',
      status: status({ hasPageTemplate: true, hasDetailsTemplate: false, moreHistory: true }),
      text: 'Open any one receipt — that teaches the extension the request it replays for the rest.',
      disabled: { history: false, fetch: true, download: true },
    },
    {
      name: 'both templates known, history not yet exhausted',
      status: status({ moreHistory: true, pending: 5 }),
      text: 'Load your full history first, then fetch the receipts.',
      disabled: { history: false, fetch: false, download: true },
    },
    {
      name: 'history exhausted, receipts pending',
      status: status({ moreHistory: false, pending: 5, captured: 2 }),
      text: 'Ready. Fetching takes about a second per receipt.',
      disabled: { history: true, fetch: false, download: false },
    },
    {
      name: 'history exhausted, nothing pending — the POPS-239 case',
      status: status({ moreHistory: false, pending: 0, captured: 5, listed: 5 }),
      text: 'Every listed receipt has been captured.',
      disabled: { history: true, fetch: true, download: false },
    },
  ];

  it.each(cases)('$name', ({ status: s, text, disabled }) => {
    expect(popup.guidance(s)[0]).toBe(text);
    expect(popup.disabledFor(s)).toEqual(disabled);
  });
});
