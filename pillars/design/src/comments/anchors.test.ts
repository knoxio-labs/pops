import { describe, expect, it } from 'vitest';

import {
  anchorLabel,
  buildSelector,
  excerpt,
  findTarget,
  parseAnchor,
  resolveAnchor,
} from './anchors';

function render(html: string): Document {
  const doc = document.implementation.createHTMLDocument('canvas');
  doc.body.innerHTML = html;
  return doc;
}

describe('excerpt', () => {
  it('collapses whitespace and trims', () => {
    const doc = render('<p>  the   amount\n column  </p>');

    expect(excerpt(doc.querySelector('p')!)).toBe('the amount column');
  });

  it('caps at 60 characters so a long paragraph is not stored whole', () => {
    const doc = render(`<p>${'x'.repeat(100)}</p>`);

    expect(excerpt(doc.querySelector('p')!)).toHaveLength(60);
  });
});

describe('buildSelector', () => {
  it('stops at the nearest id', () => {
    const doc = render('<div id="panel"><ul><li><span>row</span></li></ul></div>');

    expect(buildSelector(doc.querySelector('span')!)).toBe('#panel > ul > li > span');
  });

  it('disambiguates repeated siblings by nth-of-type', () => {
    const doc = render('<ul id="rows"><li>a</li><li>b</li></ul>');

    expect(buildSelector(doc.querySelectorAll('li')[1]!)).toBe('#rows > li:nth-of-type(2)');
  });

  it('omits nth-of-type for an only child of its kind', () => {
    const doc = render('<ul id="rows"><li>only</li></ul>');

    expect(buildSelector(doc.querySelector('li')!)).toBe('#rows > li');
  });

  it('gives up after six levels rather than emitting an unbounded path', () => {
    const doc = render(
      '<div><div><div><div><div><div><div><b>deep</b></div></div></div></div></div></div></div>'
    );

    expect(buildSelector(doc.querySelector('b')!).split(' > ')).toHaveLength(6);
  });
});

describe('parseAnchor', () => {
  it('recombines the stored payload with its kind', () => {
    expect(
      parseAnchor({ anchorKind: 'source', anchor: '{"source":"a.tsx:3","tag":"div","text":"x"}' })
    ).toEqual({ kind: 'source', source: 'a.tsx:3', tag: 'div', text: 'x' });
  });

  it('returns null for a payload that is not JSON', () => {
    expect(parseAnchor({ anchorKind: 'source', anchor: 'not json' })).toBeNull();
  });

  it('returns null for a JSON scalar, which carries no anchor fields', () => {
    expect(parseAnchor({ anchorKind: 'source', anchor: '42' })).toBeNull();
  });
});

describe('resolveAnchor', () => {
  it('finds a stamped element by its source', () => {
    const doc = render('<div data-pops-design-source="a.tsx:3">row</div>');

    expect(
      resolveAnchor(doc, { kind: 'source', source: 'a.tsx:3', tag: 'div', text: 'row' })
        ?.textContent
    ).toBe('row');
  });

  /**
   * The repeated-component case: every row of a list shares one stamp, so
   * without the excerpt tiebreak every comment on the list would resolve to
   * its first row.
   */
  it('picks the instance whose text matches when a stamp repeats', () => {
    const doc = render(
      '<div data-pops-design-source="row.tsx:1">first</div><div data-pops-design-source="row.tsx:1">second</div>'
    );

    expect(
      resolveAnchor(doc, { kind: 'source', source: 'row.tsx:1', tag: 'div', text: 'second' })
        ?.textContent
    ).toBe('second');
  });

  it('falls back to the first match when no excerpt matches any more', () => {
    const doc = render(
      '<div data-pops-design-source="row.tsx:1">first</div><div data-pops-design-source="row.tsx:1">second</div>'
    );

    expect(
      resolveAnchor(doc, { kind: 'source', source: 'row.tsx:1', tag: 'div', text: 'gone' })
        ?.textContent
    ).toBe('first');
  });

  it('resolves a token anchor', () => {
    const doc = render('<div data-pops-design-token="--background">background</div>');

    expect(
      resolveAnchor(doc, { kind: 'token', token: '--background', text: 'background' })
    ).not.toBeNull();
  });

  it('returns null for a selector that no longer matches', () => {
    const doc = render('<p>nothing here</p>');

    expect(resolveAnchor(doc, { kind: 'selector', selector: '#gone', text: '' })).toBeNull();
  });

  /**
   * A stored selector is data written by a browser months ago; a malformed
   * one must not throw inside the render pass that resolves it.
   */
  it('returns null for a selector the browser cannot parse', () => {
    const doc = render('<p>x</p>');

    expect(resolveAnchor(doc, { kind: 'selector', selector: '>>bad<<', text: '' })).toBeNull();
  });

  it('returns null for a null anchor', () => {
    expect(resolveAnchor(render('<p>x</p>'), null)).toBeNull();
  });
});

describe('findTarget', () => {
  it('prefers the nearest source stamp over a selector', () => {
    const doc = render('<div data-pops-design-source="a.tsx:3"><span id="inner">row</span></div>');
    const inner = doc.querySelector('#inner')!;
    doc.elementsFromPoint = () => [inner];

    expect(findTarget(doc, 1, 1)?.anchor).toMatchObject({ kind: 'source', source: 'a.tsx:3' });
  });

  it('falls back to a selector anchor when nothing is stamped', () => {
    const doc = render('<div id="plain">row</div>');
    doc.elementsFromPoint = () => [doc.querySelector('#plain')!];

    expect(findTarget(doc, 1, 1)?.anchor).toEqual({
      kind: 'selector',
      selector: '#plain',
      text: 'row',
    });
  });

  /**
   * Clicking the panel must not pin a comment to the panel.
   */
  it('returns null for a point on the overlay’s own chrome', () => {
    const doc = render('<div data-pops-design-overlay><button id="close">x</button></div>');
    doc.elementsFromPoint = () => [doc.querySelector('#close')!];

    expect(findTarget(doc, 1, 1)).toBeNull();
  });

  it('returns null when the point hits nothing', () => {
    const doc = render('<p>x</p>');
    doc.elementsFromPoint = () => [];

    expect(findTarget(doc, 1, 1)).toBeNull();
  });
});

describe('anchorLabel', () => {
  it('names the file and line for a source anchor', () => {
    expect(anchorLabel({ kind: 'source', source: 'a.tsx:3', tag: 'div', text: 'x' })).toBe(
      'a.tsx:3'
    );
  });

  it('quotes the excerpt for a selector anchor', () => {
    expect(anchorLabel({ kind: 'selector', selector: '#a', text: 'row' })).toBe('“row”');
  });

  it('falls back to the selector when the excerpt is empty', () => {
    expect(anchorLabel({ kind: 'selector', selector: '#a', text: '' })).toBe('#a');
  });

  it('says so when the anchor could not be parsed', () => {
    expect(anchorLabel(null)).toBe('unresolved');
  });
});
