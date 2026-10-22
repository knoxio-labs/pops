import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MAX_UPLOAD_BYTES,
  isAllowedUploadMimeType,
  mimeEssence,
  resolveMaxUploadBytes,
} from './upload-limits.js';

describe('resolveMaxUploadBytes', () => {
  it('defaults to 100 MB when unset or empty', () => {
    expect(resolveMaxUploadBytes({})).toBe(104_857_600);
    expect(resolveMaxUploadBytes({ DOCUMENTS_MAX_UPLOAD_BYTES: '' })).toBe(
      DEFAULT_MAX_UPLOAD_BYTES
    );
  });

  it('reads a positive integer override', () => {
    expect(resolveMaxUploadBytes({ DOCUMENTS_MAX_UPLOAD_BYTES: '1' })).toBe(1);
  });

  it.each([['0'], ['-5'], ['1.5'], ['abc'], ['1e400']])('throws on %j', (raw) => {
    expect(() => resolveMaxUploadBytes({ DOCUMENTS_MAX_UPLOAD_BYTES: raw })).toThrow(
      'DOCUMENTS_MAX_UPLOAD_BYTES must be a positive integer'
    );
  });
});

describe('mimeEssence', () => {
  it.each([
    ['application/pdf', 'application/pdf'],
    ['Image/PNG; foo=bar', 'image/png'],
    [undefined, null],
    ['', null],
    ['image', null],
    ['image/', null],
  ])('%j is %j', (value, expected) => {
    expect(mimeEssence(value)).toBe(expected);
  });
});

describe('isAllowedUploadMimeType', () => {
  it.each([
    ['application/pdf', true],
    ['image/heic', true],
    ['text/csv', true],
    ['application/pdfx', false],
    ['application/x-pdf', false],
    ['video/mp4', false],
    ['imagex/png', false],
  ])('%j is %j', (essence, expected) => {
    expect(isAllowedUploadMimeType(essence)).toBe(expected);
  });
});
