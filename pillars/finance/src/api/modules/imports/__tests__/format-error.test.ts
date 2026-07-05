import { describe, expect, it } from 'vitest';

import { formatImportError } from '../format-error.js';

describe('formatImportError', () => {
  it('formats a malformed-JSON SyntaxError as an AI response format issue', () => {
    const error = new SyntaxError('Unexpected token } in JSON at position 12');

    const result = formatImportError(error);

    expect(result).toEqual({
      message: 'Invalid AI response format',
      suggestion: 'This is a temporary API issue. Try again or manually categorize.',
      details: error.message,
    });
  });

  it('does not treat a SyntaxError unrelated to JSON as the AI-response branch', () => {
    const error = new SyntaxError('Unexpected identifier');

    const result = formatImportError(error);

    expect(result.message).toBe('Unexpected identifier');
    expect(result.suggestion).toBeUndefined();
  });

  it('formats a connection-refused network error', () => {
    const error = new Error('connect ECONNREFUSED 127.0.0.1:443');

    const result = formatImportError(error);

    expect(result).toEqual({
      message: 'Connection refused',
      suggestion: 'Check your internet connection and try again',
      details: error.message,
    });
  });

  it('formats a timed-out network error', () => {
    const error = new Error('connect ETIMEDOUT 127.0.0.1:443');

    const result = formatImportError(error);

    expect(result).toEqual({
      message: 'Request timed out',
      suggestion: 'Check your internet connection and try again',
      details: error.message,
    });
  });

  it('falls back to the raw message for a plain Error, carrying the transaction context as details', () => {
    const error = new Error('Insert failed: UNIQUE constraint');

    const result = formatImportError(error, { transaction: 'WOOLWORTHS 1234' });

    expect(result).toEqual({
      message: 'Insert failed: UNIQUE constraint',
      details: 'WOOLWORTHS 1234',
    });
  });

  it('falls back to "Unknown error occurred" for a non-Error thrown value', () => {
    const result = formatImportError('a string was thrown', { transaction: 'IKEA' });

    expect(result).toEqual({
      message: 'Unknown error occurred',
      details: 'IKEA',
    });
  });

  it('omits details when no transaction context is supplied', () => {
    const result = formatImportError({ notAnError: true });

    expect(result).toEqual({ message: 'Unknown error occurred', details: undefined });
  });
});
