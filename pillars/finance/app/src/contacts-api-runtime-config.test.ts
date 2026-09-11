import { describe, expect, it } from 'vitest';

import { createClientConfig } from './contacts-api-runtime-config';

describe('createClientConfig', () => {
  it('points the generated client at the shell /contacts-api proxy path', () => {
    expect(createClientConfig({})).toMatchObject({ baseUrl: '/contacts-api' });
  });

  it('preserves the caller-supplied config', () => {
    expect(createClientConfig({ headers: { 'x-trace': 'abc' } })).toMatchObject({
      baseUrl: '/contacts-api',
      headers: { 'x-trace': 'abc' },
    });
  });

  it('discards a caller-supplied baseUrl rather than honouring it', () => {
    expect(createClientConfig({ baseUrl: 'http://localhost:3010' })).toMatchObject({
      baseUrl: '/contacts-api',
    });
  });
});
