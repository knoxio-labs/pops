/**
 * These run the real pdf.js against real PDF bytes — no mock of the library.
 *
 * That makes the failure-outcome assertions meaningful: each one is the shape
 * pdf.js actually produces for that kind of file. It does NOT make the
 * column-reconstruction assertion meaningful in the same way. Those fixtures
 * are laid out by `synthetic-pdf.test-helpers.ts` on a grid this repository
 * invented, so reading the grid back proves the extractor agrees with the
 * generator. Whether a real ANZ statement uses that grid is unverified.
 */
import { describe, expect, it } from 'vitest';

import { classifyPdfFailure, extractPdfText } from './extract-pdf-text';
import {
  csvBytes,
  imageOnlyPdf,
  monospacedTextPdf,
  passwordProtectedPdf,
} from './synthetic-pdf.test-helpers';

import type { PlacedText } from './synthetic-pdf.test-helpers';

function buffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function textOf(extraction: Awaited<ReturnType<typeof extractPdfText>>): string {
  if (extraction.outcome !== 'text') throw new Error(`expected text, got ${extraction.outcome}`);
  return extraction.text;
}

const STATEMENT_ROW: PlacedText[] = [
  { row: 0, column: 0, text: '01/03/2024' },
  { row: 0, column: 12, text: '28/02/2024' },
  { row: 0, column: 24, text: '1234' },
  { row: 0, column: 30, text: 'ALDI STORES - MARRICKV' },
  { row: 0, column: 56, text: 'MARRICKVILLE' },
  { row: 0, column: 76, text: '42.10' },
  { row: 0, column: 86, text: '1,234.56' },
];

describe('extractPdfText', () => {
  it('returns one line per printed row', async () => {
    const pdf = monospacedTextPdf([
      [
        { row: 0, column: 0, text: 'Statement of account' },
        { row: 1, column: 0, text: 'Card ending 1234' },
      ],
    ]);
    expect(textOf(await extractPdfText(buffer(pdf))).split('\n')).toEqual([
      'Statement of account',
      'Card ending 1234',
    ]);
  });

  it('keeps pages in order and reports how many there were', async () => {
    const pdf = monospacedTextPdf([
      [{ row: 0, column: 0, text: 'page one' }],
      [{ row: 0, column: 0, text: 'page two' }],
    ]);
    const extraction = await extractPdfText(buffer(pdf));
    expect(extraction).toEqual({ outcome: 'text', text: 'page one\npage two', pageCount: 2 });
  });

  it('rebuilds the gap between two columns as the number of characters it spans', async () => {
    // The generator placed the second run 26 cells from the first's origin, and
    // the first run is 22 characters long, so four spaces is the only answer
    // consistent with the layout that was written.
    const pdf = monospacedTextPdf([
      [
        { row: 0, column: 0, text: 'ALDI STORES - MARRICKV' },
        { row: 0, column: 26, text: 'MARRICKVILLE' },
      ],
    ]);
    expect(textOf(await extractPdfText(buffer(pdf)))).toBe(
      'ALDI STORES - MARRICKV    MARRICKVILLE'
    );
  });

  it('does not fuse two runs printed side by side', async () => {
    const pdf = monospacedTextPdf([
      [
        { row: 0, column: 0, text: 'ONE' },
        { row: 0, column: 4, text: 'TWO' },
      ],
    ]);
    expect(textOf(await extractPdfText(buffer(pdf)))).toBe('ONE TWO');
  });

  it('reconstructs a statement row the ANZ row grammar can read', async () => {
    const extraction = await extractPdfText(buffer(monospacedTextPdf([STATEMENT_ROW])));
    expect(textOf(extraction)).toBe(
      '01/03/2024  28/02/2024  1234  ALDI STORES - MARRICKV    MARRICKVILLE        42.10     1,234.56'
    );
  });

  it('reports a password-protected file rather than throwing', async () => {
    expect(await extractPdfText(buffer(passwordProtectedPdf()))).toEqual({
      outcome: 'password-protected',
    });
  });

  it('reports a page of images as carrying no text layer', async () => {
    expect(await extractPdfText(buffer(imageOnlyPdf()))).toEqual({
      outcome: 'no-text-layer',
      pageCount: 1,
    });
  });

  it('reports a non-PDF upload as not a PDF', async () => {
    const extraction = await extractPdfText(buffer(csvBytes()));
    expect(extraction.outcome).toBe('not-a-pdf');
  });

  it('reports an empty file as not a PDF', async () => {
    const extraction = await extractPdfText(new ArrayBuffer(0));
    expect(extraction.outcome).toBe('not-a-pdf');
  });
});

describe('classifyPdfFailure', () => {
  it('keeps the message of a failure it does not model', () => {
    const error = new Error('worker terminated');
    error.name = 'UnexpectedResponseException';
    expect(classifyPdfFailure(error)).toEqual({
      outcome: 'unreadable',
      detail: 'worker terminated',
    });
  });

  it('describes a non-Error rejection rather than dropping it', () => {
    expect(classifyPdfFailure('exploded')).toEqual({ outcome: 'unreadable', detail: 'exploded' });
  });
});
