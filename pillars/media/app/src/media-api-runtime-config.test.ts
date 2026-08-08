import { describe, expect, it } from 'vitest';

import { createClientConfig } from './media-api-runtime-config';

describe('createClientConfig', () => {
  it('points the generated client at the shell /media-api proxy path', () => {
    expect(createClientConfig({})).toMatchObject({ baseUrl: '/media-api' });
  });

  it('preserves the caller-supplied config', () => {
    expect(createClientConfig({ headers: { 'x-trace': 'abc' } })).toMatchObject({
      baseUrl: '/media-api',
      headers: { 'x-trace': 'abc' },
    });
  });

  it('discards a caller-supplied baseUrl rather than honouring it', () => {
    expect(createClientConfig({ baseUrl: 'http://localhost:3003' })).toMatchObject({
      baseUrl: '/media-api',
    });
  });
});
