import { describe, expect, it } from 'vitest';

import { linesFromTextItems, measureCharacterCell, type PdfTextItem } from './pdf-text-lines';

/** A run of `text` starting at `x`, on the line at `y`, in a cell-wide monospaced font. */
function run(text: string, x: number, y: number, cell = 6, hasEOL = false): PdfTextItem {
  return { str: text, width: text.length * cell, transform: [cell, 0, 0, cell, x, y], hasEOL };
}

/** A gap run: what pdf.js emits for a hole between two columns — one space, the hole's width. */
function gap(x: number, y: number, width: number): PdfTextItem {
  return { str: ' ', width, transform: [6, 0, 0, 6, x, y], hasEOL: false };
}

describe('measureCharacterCell', () => {
  it('measures the cell from the line’s own runs', () => {
    expect(measureCharacterCell([run('ABCD', 0, 700), run('EF', 40, 700)])).toBe(6);
  });

  it('ignores gap runs, whose width is the hole rather than a character', () => {
    expect(measureCharacterCell([run('ABCD', 0, 700), gap(24, 700, 120), run('EF', 144, 700)])).toBe(
      6
    );
  });

  it('averages a proportional line rather than refusing to measure it', () => {
    const wide: PdfTextItem = { str: 'WW', width: 20, transform: [10, 0, 0, 10, 0, 700], hasEOL: false };
    const narrow: PdfTextItem = { str: 'ii', width: 4, transform: [10, 0, 0, 10, 20, 700], hasEOL: false };
    expect(measureCharacterCell([wide, narrow])).toBe(6);
  });

  it('falls back rather than dividing by zero on a line of pure gaps', () => {
    expect(measureCharacterCell([gap(0, 700, 60)])).toBe(1);
  });
});

describe('linesFromTextItems', () => {
  it('groups runs sharing a baseline into one line', () => {
    expect(linesFromTextItems([run('LEFT', 0, 700), run('RIGHT', 30, 700)])).toEqual([
      'LEFT RIGHT',
    ]);
  });

  it('starts a new line when the baseline moves', () => {
    expect(linesFromTextItems([run('first', 0, 700), run('second', 0, 688)])).toEqual([
      'first',
      'second',
    ]);
  });

  it('treats a sub-unit baseline wobble as the same line', () => {
    expect(linesFromTextItems([run('AB', 0, 700), run('CD', 12, 701)])).toEqual(['ABCD']);
  });

  it('breaks where pdf.js says the line ends, even at the same baseline', () => {
    // A two-column page lays the second column's first row on the first
    // column's baseline. Only the end-of-line mark separates them.
    expect(
      linesFromTextItems([run('column one', 0, 700, 6, true), run('column two', 300, 700)])
    ).toEqual(['column one', 'column two']);
  });

  it('expands a gap run into the number of characters it spans', () => {
    expect(linesFromTextItems([run('AB', 0, 700), gap(12, 700, 24), run('CD', 36, 700)])).toEqual([
      'AB    CD',
    ]);
  });

  it('expands a bare positional gap with no run of its own', () => {
    expect(linesFromTextItems([run('AB', 0, 700), run('CD', 42, 700)])).toEqual(['AB     CD']);
  });

  it('never fuses two runs that touch', () => {
    expect(linesFromTextItems([run('AB', 0, 700), run('CD', 12, 700)])).toEqual(['ABCD']);
  });

  it('reads a line left to right however the page emitted it', () => {
    expect(linesFromTextItems([run('SECOND', 60, 700), run('FIRST', 0, 700)])).toEqual([
      'FIRST     SECOND',
    ]);
  });

  it('drops trailing space on a line rather than carrying it into the parser', () => {
    expect(linesFromTextItems([run('AB', 0, 700), gap(12, 700, 60)])).toEqual(['AB']);
  });

  it('drops a line that holds nothing but a gap', () => {
    expect(linesFromTextItems([gap(0, 700, 60), run('real', 0, 688)])).toEqual(['real']);
  });

  it('ignores runs with no text at all', () => {
    const empty: PdfTextItem = { str: '', width: 0, transform: [6, 0, 0, 6, 0, 700], hasEOL: false };
    expect(linesFromTextItems([empty, run('kept', 0, 700)])).toEqual(['kept']);
  });
});
