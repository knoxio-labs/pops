import { describe, expect, it } from 'vitest';

import { createClientConfig } from '../purchases-api-runtime-config';

describe('purchases API runtime config', () => {
  it('points the generated client at the shell proxy path', () => {
    expect(createClientConfig({}).baseUrl).toBe('/purchases-api');
  });

  // The hook spreads the incoming config FIRST and then sets `baseUrl`, so a
  // caller cannot redirect the default client by passing one. Getting this
  // backwards would let a stray config send purchase data at another origin.
  it('discards a caller-supplied baseUrl rather than honouring it', () => {
    expect(createClientConfig({ baseUrl: 'https://elsewhere.example' }).baseUrl).toBe(
      '/purchases-api'
    );
  });

  it('preserves the rest of the incoming config', () => {
    const headers = { 'x-test': 'kept' };
    expect(createClientConfig({ headers }).headers).toBe(headers);
  });
});
