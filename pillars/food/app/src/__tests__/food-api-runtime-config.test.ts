import { describe, expect, it } from 'vitest';

import { createClientConfig } from '../food-api-runtime-config';

describe('createClientConfig', () => {
  it('points the generated client at the shell /food-api proxy path', () => {
    expect(createClientConfig({})).toMatchObject({ baseUrl: '/food-api' });
  });

  it('preserves the caller-supplied config', () => {
    expect(createClientConfig({ headers: { 'x-trace': 'abc' } })).toMatchObject({
      baseUrl: '/food-api',
      headers: { 'x-trace': 'abc' },
    });
  });

  it('discards a caller-supplied baseUrl rather than honouring it', () => {
    expect(createClientConfig({ baseUrl: 'http://localhost:3005' })).toMatchObject({
      baseUrl: '/food-api',
    });
  });
});
