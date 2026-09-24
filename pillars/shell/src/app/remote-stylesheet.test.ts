import { afterEach, describe, expect, it, vi } from 'vitest';

import { DOCUMENT_LOAD_ID } from './remote-entry-url';
import { installRemoteStylesheet } from './remote-stylesheet';

function freshDocument(): Document {
  return document.implementation.createHTMLDocument('shell');
}

function sheets(doc: Document): HTMLLinkElement[] {
  return [...doc.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')];
}

function onlySheet(doc: Document): HTMLLinkElement {
  const [link, ...rest] = sheets(doc);
  if (link === undefined || rest.length > 0) throw new Error('expected exactly one stylesheet');
  return link;
}

/** Whether `promise` has settled by the time queued microtasks have drained. */
async function hasSettled(promise: Promise<void>): Promise<boolean> {
  let settled = false;
  void promise.then(() => {
    settled = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  return settled;
}

describe('installRemoteStylesheet', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('links the per-load URL of the sheet into the head', () => {
    const doc = freshDocument();
    void installRemoteStylesheet('/acme-ui/acme.css', doc);

    expect(onlySheet(doc).getAttribute('href')).toBe(
      `/acme-ui/acme.css?v=${encodeURIComponent(DOCUMENT_LOAD_ID)}`
    );
  });

  it('stays pending until the browser has loaded the sheet', async () => {
    const doc = freshDocument();
    const installed = installRemoteStylesheet('/acme-ui/acme.css', doc);

    expect(await hasSettled(installed)).toBe(false);
    onlySheet(doc).dispatchEvent(new Event('load'));
    expect(await hasSettled(installed)).toBe(true);
  });

  it('resolves rather than rejects when the sheet fails, and says which one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const doc = freshDocument();
    const installed = installRemoteStylesheet('/acme-ui/acme.css', doc);

    onlySheet(doc).dispatchEvent(new Event('error'));

    await expect(installed).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('/acme-ui/acme.css'));
  });

  it('adds no second link for the same sheet, and shares the first one outcome', async () => {
    const doc = freshDocument();
    const first = installRemoteStylesheet('/acme-ui/acme.css', doc);
    const second = installRemoteStylesheet('/acme-ui/acme.css', doc);

    expect(sheets(doc)).toHaveLength(1);
    expect(await hasSettled(second)).toBe(false);
    onlySheet(doc).dispatchEvent(new Event('load'));
    expect(await hasSettled(first)).toBe(true);
    expect(await hasSettled(second)).toBe(true);
  });

  it('gives each pillar its own link', () => {
    const doc = freshDocument();
    void installRemoteStylesheet('/acme-ui/acme.css', doc);
    void installRemoteStylesheet('/other-ui/other.css', doc);

    expect(sheets(doc).map((link) => link.getAttribute('href'))).toEqual([
      expect.stringMatching(/^\/acme-ui\/acme\.css\?v=/),
      expect.stringMatching(/^\/other-ui\/other\.css\?v=/),
    ]);
  });

  it('treats a link it did not add as already settled', async () => {
    const doc = freshDocument();
    const existing = doc.createElement('link');
    existing.rel = 'stylesheet';
    existing.setAttribute('href', `/acme-ui/acme.css?v=${encodeURIComponent(DOCUMENT_LOAD_ID)}`);
    doc.head.append(existing);

    const installed = installRemoteStylesheet('/acme-ui/acme.css', doc);

    expect(sheets(doc)).toHaveLength(1);
    expect(await hasSettled(installed)).toBe(true);
  });
});
