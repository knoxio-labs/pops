import { describe, expect, it } from 'vitest';

import { acceptFor, uploadLimitsOf, uploadRefusal } from './document-upload-limits';

const status = { maxUploadBytes: null, allowedMimeTypes: null };

describe('uploadLimitsOf', () => {
  it('reads the cap and allowlist documents states', () => {
    expect(
      uploadLimitsOf({
        maxUploadBytes: 104857600,
        allowedMimeTypes: ['application/pdf', 'image/*', 'text/*'],
      })
    ).toEqual({
      maxUploadBytes: 104857600,
      allowedMimeTypes: ['application/pdf', 'image/*', 'text/*'],
    });
  });

  it('yields null when the status carries no limits, rather than guessing one', () => {
    expect(uploadLimitsOf(status)).toBeNull();
    expect(uploadLimitsOf(null)).toBeNull();
    expect(uploadLimitsOf(undefined)).toBeNull();
  });

  it('yields null when either limit is missing or the allowlist is empty', () => {
    expect(uploadLimitsOf({ maxUploadBytes: 10, allowedMimeTypes: null })).toBeNull();
    expect(uploadLimitsOf({ maxUploadBytes: null, allowedMimeTypes: ['text/*'] })).toBeNull();
    expect(uploadLimitsOf({ maxUploadBytes: 10, allowedMimeTypes: [] })).toBeNull();
  });
});

describe('uploadRefusal', () => {
  const file = new File(['abc'], 'scan', { type: '' });

  it('names an untyped file as an unknown type', () => {
    expect(
      uploadRefusal({
        type: 'not-accepted',
        file,
        accept: acceptFor({ maxUploadBytes: 1, allowedMimeTypes: ['application/pdf', 'text/*'] }),
      })
    ).toBe('scan is an unknown type. Paperless takes application/pdf, text/*.');
  });

  it('states the size against the cap', () => {
    expect(uploadRefusal({ type: 'too-large', file, maxSize: 2 })).toBe(
      'scan is 3 B. Paperless takes files up to 2 B.'
    );
  });
});
