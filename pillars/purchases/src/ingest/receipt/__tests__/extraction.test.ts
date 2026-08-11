import { describe, expect, it } from 'vitest';

import { ExtractionShapeError, parseExtraction } from '../extraction.js';

const MINIMAL_RECEIPT = {
  merchantName: 'Bunnings',
  purchasedOn: '2026-08-01',
  purchasedAt: '14:32',
  currency: 'AUD',
  total: '$27.50',
  tax: null,
  lines: [{ description: 'Timber', amount: '$27.50' }],
};

describe('parseExtraction', () => {
  it('parses a clean JSON object', () => {
    const result = parseExtraction(JSON.stringify(MINIMAL_RECEIPT));
    expect(result.merchantName).toBe('Bunnings');
    expect(result.total).toBe('$27.50');
  });

  it('unwraps JSON the model wrapped in prose', () => {
    const result = parseExtraction(
      `Here is the receipt:\n${JSON.stringify(MINIMAL_RECEIPT)}\nLet me know if you need more.`
    );
    expect(result.total).toBe('$27.50');
  });

  it('unwraps JSON the model fenced as a code block', () => {
    const result = parseExtraction('```json\n' + JSON.stringify(MINIMAL_RECEIPT) + '\n```');
    expect(result.total).toBe('$27.50');
  });

  it('ignores braces inside a string value when finding the object span', () => {
    const withBraceInString = { ...MINIMAL_RECEIPT, merchantName: 'Shop {Downtown}' };
    const result = parseExtraction(JSON.stringify(withBraceInString));
    expect(result.merchantName).toBe('Shop {Downtown}');
  });

  it('reads a JSON string carrying an escaped quote correctly', () => {
    // Exercises the escape tracking: a `\"` inside a string must not be read
    // as the string's closing quote, or the brace-balancing that follows it
    // sees content that is still "inside a string" as code.
    const withEscapedQuote = { ...MINIMAL_RECEIPT, merchantName: 'The "Corner" Store' };
    const result = parseExtraction(JSON.stringify(withEscapedQuote));
    expect(result.merchantName).toBe('The "Corner" Store');
  });

  it('throws ExtractionShapeError when the model returned no JSON object at all', () => {
    expect(() => parseExtraction('I cannot read this receipt.')).toThrow(ExtractionShapeError);
  });

  it('throws ExtractionShapeError on an unterminated (truncated) JSON object', () => {
    const truncated = JSON.stringify(MINIMAL_RECEIPT).slice(0, -10);
    expect(() => parseExtraction(truncated)).toThrow(ExtractionShapeError);
  });

  it('throws ExtractionShapeError on malformed JSON inside otherwise-balanced braces', () => {
    expect(() => parseExtraction('{ "total": "$1.00", }')).toThrow(ExtractionShapeError);
  });

  it('reports every schema fault at once rather than only the first', () => {
    try {
      parseExtraction(JSON.stringify({ total: '$1.00', lines: [] }));
      expect.unreachable('expected parseExtraction to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ExtractionShapeError);
      const message = (error as ExtractionShapeError).message;
      expect(message).toContain('merchantName');
      expect(message).toContain('purchasedOn');
    }
  });
});
