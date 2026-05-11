import { describe, expect, it } from 'vitest';

import { loadConfig } from '../config.js';

describe('loadConfig', () => {
  it('falls back to localhost:3000 when POPS_API_URL is unset', () => {
    expect(loadConfig({}).apiUrl).toBe('http://localhost:3000');
  });

  it('strips a trailing slash from POPS_API_URL', () => {
    expect(loadConfig({ POPS_API_URL: 'https://pops.local/' }).apiUrl).toBe('https://pops.local');
  });

  it('treats whitespace-only POPS_API_URL as unset', () => {
    expect(loadConfig({ POPS_API_URL: '   ' }).apiUrl).toBe('http://localhost:3000');
  });

  it('returns POPS_API_KEY when set', () => {
    expect(loadConfig({ POPS_API_KEY: 'pops_sa_abc' }).apiKey).toBe('pops_sa_abc');
  });

  it('returns undefined apiKey when POPS_API_KEY is unset or blank', () => {
    expect(loadConfig({}).apiKey).toBeUndefined();
    expect(loadConfig({ POPS_API_KEY: '   ' }).apiKey).toBeUndefined();
  });
});
