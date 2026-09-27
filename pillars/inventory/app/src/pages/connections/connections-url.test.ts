import { describe, expect, it } from 'vitest';

import {
  parseConnectionKind,
  parseConnectionsUrl,
  writeConnectionsUrl,
} from './connections-url.js';

describe('Connections URL state', () => {
  it('accepts only server-supported connection kinds', () => {
    expect(parseConnectionKind('item')).toBe('item');
    expect(parseConnectionKind('fixture')).toBe('fixture');
    expect(parseConnectionKind(null)).toBe('all');
    expect(parseConnectionKind('all')).toBe('all');
    expect(parseConnectionKind('cable')).toBe('all');
  });

  it('parses valid state and falls back for invalid values', () => {
    expect(
      parseConnectionsUrl(
        new URLSearchParams('q=%20outlet%20&kind=fixture&view=graph&trace=item-1')
      )
    ).toEqual({
      q: ' outlet ',
      kind: 'fixture',
      view: 'graph',
      trace: 'item-1',
    });
    expect(parseConnectionsUrl(new URLSearchParams('kind=invalid&view=invalid'))).toEqual({
      q: '',
      kind: 'all',
      view: 'list',
      trace: null,
    });
  });

  it('writes owned values with replace-friendly defaults and preserves other params', () => {
    const current = new URLSearchParams('other=kept&q=old&kind=fixture');
    expect(
      writeConnectionsUrl(current, {
        q: 'new',
        kind: 'item',
        view: 'graph',
        trace: 'item-1',
      }).toString()
    ).toBe('other=kept&q=new&kind=item&view=graph&trace=item-1');
    expect(
      writeConnectionsUrl(current, { q: '', kind: 'all', view: 'list', trace: null }).toString()
    ).toBe('other=kept');

    expect(writeConnectionsUrl(current, { q: ' trailing ' }).get('q')).toBe(' trailing ');
  });
});
