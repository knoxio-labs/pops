import { describe, expect, it } from 'vitest';

import { formatBytes } from './format';

describe('formatBytes', () => {
  it('formats 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes just under 1 KB with no decimal', () => {
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('formats exactly 1024 bytes as 1.0 KB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
  });

  it('formats a MB value', () => {
    expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.5 MB');
  });

  it('formats a GB value', () => {
    expect(formatBytes(1024 * 1024 * 1024 * 3)).toBe('3.0 GB');
  });

  it('honours a custom precision', () => {
    expect(formatBytes(2048, { precision: 2 })).toBe('2.00 KB');
  });

  it('renders the decimal separator for pt-BR with a comma', () => {
    expect(formatBytes(2048, { locale: 'pt-BR' })).toBe('2,0 KB');
  });

  it('keeps a point for en-AU', () => {
    expect(formatBytes(2048, { locale: 'en-AU' })).toBe('2.0 KB');
  });

  it('defaults to en-AU when no locale is given', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
  });
});
