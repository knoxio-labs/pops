/**
 * Recognising a priced-by-measure note.
 *
 * The consequence of a false positive is a caveat on a line that did not
 * need one; the consequence of a false negative is an uncaveated weight
 * presented beside real prices. Both directions are pinned, and the strings
 * are the ones the two adapters that write these notes actually store.
 */
import { describe, expect, it } from 'vitest';

import { isMeasureNote } from '../measure-notes.js';

describe('isMeasureNote', () => {
  it.each([
    '0.202 kg NET @ $2.90/kg',
    '1.245 kg @ $4.00/kg',
    '500 g @ $1.20/100g',
    '2 ea @ $1.50',
    '1.5 L @ $3.00/L',
  ])('recognises %s as priced by measure', (note) => {
    expect(isMeasureNote(note)).toBe(true);
  });

  it.each([
    // A count, not a measure: the unit price on such a line is a real price.
    'Qty 2 @ $9.24 each',
    '2 @ $7.50',
    // A promotion, which says nothing about how the line was measured.
    'PRICE REDUCED BY $7.26 each',
    // A weight inside a product name. No rate, so nothing was weighed here.
    'Sand Washed 20kg',
    '',
  ])('does not read %s as priced by measure', (note) => {
    expect(isMeasureNote(note)).toBe(false);
  });
});
