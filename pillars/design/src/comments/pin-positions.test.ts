import { describe, expect, it } from 'vitest';

import { placePins } from './pin-positions';

import type { Thread } from './api';

function thread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 't1',
    route: '/s/finance/import-review',
    themeKey: '',
    viewport: '',
    anchorKind: 'selector',
    anchor: '{"selector":"#row","text":"row"}',
    status: 'open',
    createdBy: 'operator@pops.local',
    createdAt: '2026-01-01T00:00:00.000Z',
    resolvedBy: null,
    resolvedAt: null,
    messages: [],
    ...overrides,
  };
}

function render(html: string): Document {
  const doc = document.implementation.createHTMLDocument('canvas');
  doc.body.innerHTML = html;
  return doc;
}

function stubRect(el: Element, rect: { left: number; top: number; width: number }): void {
  el.getBoundingClientRect = () =>
    ({ left: rect.left, top: rect.top, width: rect.width, height: 20 }) as DOMRect;
}

describe('placePins', () => {
  it('centres a pin horizontally on its element', () => {
    const doc = render('<div id="row">row</div>');
    stubRect(doc.querySelector('#row')!, { left: 100, top: 40, width: 60 });

    expect(placePins(doc, [thread()])).toEqual([
      expect.objectContaining({ left: 130, top: 40, index: 1 }),
    ]);
  });

  /**
   * The numbering is the panel's, so a dropped pin must not renumber the
   * ones after it — a reader matching "3." in the panel to a dot on screen
   * would otherwise land on the wrong thread.
   */
  it('drops an unresolvable thread while keeping the panel’s numbering', () => {
    const doc = render('<div id="row">row</div>');
    stubRect(doc.querySelector('#row')!, { left: 0, top: 0, width: 10 });

    const placed = placePins(doc, [
      thread({ id: 'gone', anchor: '{"selector":"#missing","text":""}' }),
      thread({ id: 'here' }),
    ]);

    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({ index: 2 });
  });

  it('places nothing when no thread resolves', () => {
    const doc = render('<p>empty</p>');

    expect(placePins(doc, [thread({ anchor: '{"selector":"#missing","text":""}' })])).toEqual([]);
  });
});
