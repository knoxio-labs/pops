/**
 * `UploadReceiptBodySchema.parts` has no count ceiling (ADR-052): a receipt
 * arriving as many photographs is not refused for its length, only for the
 * body-size limit every other upload is already subject to.
 */
import { describe, expect, it } from 'vitest';

import { ReceiptPartSchema, UploadReceiptBodySchema } from '../rest-receipts.js';

const PART = { mediaType: 'image/jpeg', dataBase64: 'AAAA' } as const;

describe('UploadReceiptBodySchema.parts', () => {
  it('rejects an empty parts array — a receipt needs at least one', () => {
    const result = UploadReceiptBodySchema.safeParse({ parts: [] });
    expect(result.success).toBe(false);
  });

  it('accepts a single part', () => {
    const result = UploadReceiptBodySchema.safeParse({ parts: [PART] });
    expect(result.success).toBe(true);
  });

  it('accepts more than the old eight-part ceiling', () => {
    const parts = Array.from({ length: 20 }, () => PART);
    const result = UploadReceiptBodySchema.safeParse({ parts });
    expect(result.success).toBe(true);
  });
});

describe('ReceiptPartSchema', () => {
  it('rejects a part with no bytes', () => {
    const result = ReceiptPartSchema.safeParse({ mediaType: 'image/jpeg', dataBase64: '' });
    expect(result.success).toBe(false);
  });
});
