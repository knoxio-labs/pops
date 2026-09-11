import { getI18n } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { describeFileValidationError, type FileValidationErrorReason } from '../index';

function jpg(name: string, sizeBytes = 10): File {
  return new File([new Uint8Array(sizeBytes)], name, { type: 'image/jpeg' });
}

describe('describeFileValidationError — importable from the package entry point', () => {
  const t = getI18n().getFixedT('en-AU', 'ui');

  it('phrases a not-accepted reason', () => {
    const reason: FileValidationErrorReason = {
      type: 'not-accepted',
      file: jpg('invoice.pdf'),
      accept: 'image/jpeg',
    };

    expect(describeFileValidationError(t, reason, 'en-AU')).toBe(
      'invoice.pdf is not an accepted file type'
    );
  });

  it('phrases a too-large reason, formatting the bound with the given locale', () => {
    const reason: FileValidationErrorReason = {
      type: 'too-large',
      file: jpg('big.jpg', 1_000_000),
      maxSize: 2048,
    };

    expect(describeFileValidationError(t, reason, 'en-AU')).toBe(
      'big.jpg exceeds max size of 2.0 KB'
    );
  });

  it('phrases a too-many reason', () => {
    const reason: FileValidationErrorReason = { type: 'too-many', maxFiles: 1, attempted: 3 };

    expect(describeFileValidationError(t, reason, 'en-AU')).toBe('You can upload at most 1 file');
  });
});
