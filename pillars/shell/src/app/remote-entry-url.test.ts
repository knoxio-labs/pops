import { describe, expect, it, vi } from 'vitest';

import {
  DOCUMENT_LOAD_ID,
  entryUrlForThisLoad,
  shellDocumentProbeUrl,
  uncachedProbeUrl,
} from './remote-entry-url';

describe('uncachedProbeUrl', () => {
  it('gives every probe a URL no earlier request used, unlike the import URL', () => {
    const first = uncachedProbeUrl('/media-ui/media.js');
    const second = uncachedProbeUrl('/media-ui/media.js');
    expect(first).toMatch(/^\/media-ui\/media\.js\?v=.+$/);
    expect(second).not.toBe(first);
    expect(first).not.toBe(entryUrlForThisLoad('/media-ui/media.js'));
  });

  it('probes the shell document for the shell’s own boundaries', () => {
    expect(shellDocumentProbeUrl()).toMatch(/^\/index\.html\?v=.+$/);
  });
});

describe('entryUrlForThisLoad', () => {
  it('adds the load id as a query so no cache can have seen the URL', () => {
    expect(entryUrlForThisLoad('/finance-ui/finance.js', 'abc')).toBe(
      '/finance-ui/finance.js?v=abc'
    );
  });

  it('keeps an existing query', () => {
    expect(entryUrlForThisLoad('/x-ui/x.js?lang=en', 'abc')).toBe('/x-ui/x.js?lang=en&v=abc');
  });

  it('keeps a fragment after the query', () => {
    expect(entryUrlForThisLoad('/x-ui/x.js#part', 'abc')).toBe('/x-ui/x.js?v=abc#part');
  });

  it('encodes the load id', () => {
    expect(entryUrlForThisLoad('/x.js', 'a b&c')).toBe('/x.js?v=a%20b%26c');
  });

  it('leaves an empty URL empty rather than producing a bare query', () => {
    expect(entryUrlForThisLoad('', 'abc')).toBe('');
  });

  it('uses one id for the whole document, so the preload and the import share a request', () => {
    expect(entryUrlForThisLoad('/finance-ui/finance.js')).toBe(
      entryUrlForThisLoad('/finance-ui/finance.js')
    );
    expect(entryUrlForThisLoad('/finance-ui/finance.js')).toContain(`v=${DOCUMENT_LOAD_ID}`);
  });

  it('gives a new document a new id', async () => {
    vi.resetModules();
    const again = await import('./remote-entry-url');
    expect(again.DOCUMENT_LOAD_ID).not.toBe(DOCUMENT_LOAD_ID);
  });
});
