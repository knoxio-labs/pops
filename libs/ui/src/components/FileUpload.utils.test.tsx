import { getI18n } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import {
  describeFileValidationError,
  validateFiles,
  type FileValidationErrorReason,
} from '../index';

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

describe('validateFiles — importable from the package entry point', () => {
  it('drops files that fail the accept pattern and reports each refusal', () => {
    const onError = vi.fn();
    const accepted = jpg('photo.jpg');
    const rejected = new File([new Uint8Array(10)], 'notes.txt', { type: 'text/plain' });

    const result = validateFiles({
      list: [accepted, rejected],
      accept: 'image/*',
      onError,
    });

    expect(result).toEqual([accepted]);
    expect(onError).toHaveBeenCalledWith({
      type: 'not-accepted',
      file: rejected,
      accept: 'image/*',
    });
  });

  it('truncates to maxFiles and reports the full attempted count', () => {
    const onError = vi.fn();
    const files = [jpg('a.jpg'), jpg('b.jpg'), jpg('c.jpg')];

    const result = validateFiles({ list: files, maxFiles: 1, onError });

    expect(result).toEqual([files[0]]);
    expect(onError).toHaveBeenCalledWith({ type: 'too-many', maxFiles: 1, attempted: 3 });
  });
});
