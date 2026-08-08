import { describe, expect, it } from 'vitest';

import { createClientConfig } from './inventory-api-runtime-config';

describe('createClientConfig', () => {
  it('points the generated client at the shell /inventory-api proxy path', () => {
    expect(createClientConfig({})).toMatchObject({ baseUrl: '/inventory-api' });
  });

  it('preserves the caller-supplied config', () => {
    expect(createClientConfig({ headers: { 'x-trace': 'abc' } })).toMatchObject({
      baseUrl: '/inventory-api',
      headers: { 'x-trace': 'abc' },
    });
  });

  it('discards a caller-supplied baseUrl rather than honouring it', () => {
    expect(createClientConfig({ baseUrl: 'http://localhost:3002' })).toMatchObject({
      baseUrl: '/inventory-api',
    });
  });
});
