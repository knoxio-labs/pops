import { describe, expect, it } from 'vitest';

import { ERROR_MESSAGES, errorMessage } from './error-messages.js';

describe('errorMessage()', () => {
  it('returns the template verbatim when there are no placeholders', () => {
    expect(errorMessage('finance.import.sessionNotFound')).toBe('Import session not found');
  });

  it('interpolates a single placeholder', () => {
    expect(errorMessage('media.library.movieNotFoundOnTmdb', { tmdbId: '550' })).toBe(
      'Movie not found on TMDB (ID: 550)'
    );
  });

  it('interpolates multiple placeholders', () => {
    expect(errorMessage('common.notFound', { resource: 'Budget', id: '42' })).toBe(
      "Budget '42' not found"
    );
  });

  it('replaces missing param placeholders with empty string', () => {
    const result = errorMessage('media.arr.apiError', { service: 'Radarr' });
    expect(result).toBe('Radarr error: ');
  });

  it('handles templates with escaped single quotes', () => {
    expect(errorMessage('cerebrum.nudge.notFound', { id: 'abc-123' })).toBe(
      "Nudge 'abc-123' not found"
    );
  });

  it('returns unmodified template when params is undefined', () => {
    expect(errorMessage('common.validationFailed')).toBe('Validation failed');
  });
});

describe('ERROR_MESSAGES registry', () => {
  it('contains at least 30 keys', () => {
    expect(Object.keys(ERROR_MESSAGES).length).toBeGreaterThanOrEqual(30);
  });

  it('every value is a non-empty string', () => {
    for (const [key, value] of Object.entries(ERROR_MESSAGES)) {
      expect(typeof value).toBe('string');
      expect(value.length, `key "${key}" has empty message`).toBeGreaterThan(0);
    }
  });

  it('keys follow dotted namespace convention', () => {
    for (const key of Object.keys(ERROR_MESSAGES)) {
      expect(key).toMatch(/^[a-z]+(\.[a-zA-Z]+)+$/);
    }
  });
});
