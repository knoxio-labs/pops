import { describe, expect, it } from 'vitest';

import { NotFoundError, ValidationError } from '../../shared/errors.js';
import { mapServiceError, mcpError, mcpSuccess } from '../errors.js';
import { extractText, parseResult } from './test-helpers.js';

describe('mcpSuccess', () => {
  it('wraps a payload in a text content block', () => {
    const result = mcpSuccess({ count: 42 });
    expect(result).toEqual({
      content: [{ type: 'text', text: '{"count":42}' }],
    });
  });

  it('serialises null', () => {
    const result = mcpSuccess(null);
    expect(result).toEqual({
      content: [{ type: 'text', text: 'null' }],
    });
  });

  it('does not set isError', () => {
    const result = mcpSuccess({ ok: true });
    expect(result).not.toHaveProperty('isError');
  });
});

describe('mcpError', () => {
  it('wraps an error message and code in a text content block', () => {
    const result = mcpError('not found', 'NOT_FOUND');
    const parsed = parseResult(result);
    expect(parsed).toEqual({ error: 'not found', code: 'NOT_FOUND' });
  });

  it('sets isError to true', () => {
    const result = mcpError('oops', 'INTERNAL_ERROR');
    expect(result.isError).toBe(true);
  });
});

describe('mapServiceError', () => {
  it('maps NotFoundError to NOT_FOUND', () => {
    const err = new NotFoundError('Engram', 'eng_123');
    const result = mapServiceError(err);
    const parsed = parseResult(result) as { code: string; error: string };
    expect(parsed.code).toBe('NOT_FOUND');
    expect(parsed.error).toContain('eng_123');
    expect(result.isError).toBe(true);
  });

  it('maps ValidationError to VALIDATION_ERROR', () => {
    const err = new ValidationError({ field: 'bad' });
    const result = mapServiceError(err);
    const parsed = parseResult(result) as { code: string };
    expect(parsed.code).toBe('VALIDATION_ERROR');
    expect(result.isError).toBe(true);
  });

  it('maps generic Error to INTERNAL_ERROR', () => {
    const err = new Error('something broke');
    const result = mapServiceError(err);
    const parsed = parseResult(result) as { code: string; error: string };
    expect(parsed.code).toBe('INTERNAL_ERROR');
    expect(parsed.error).toBe('something broke');
  });

  it('maps non-Error values to INTERNAL_ERROR with stringified message', () => {
    const result = mapServiceError('raw string error');
    const parsed = parseResult(result) as { code: string; error: string };
    expect(parsed.code).toBe('INTERNAL_ERROR');
    expect(parsed.error).toBe('raw string error');
  });

  it('extractText returns {} for non-text content', () => {
    // Ensure the helper is safe
    const text = extractText({ content: [] });
    expect(text).toBe('{}');
  });
});
