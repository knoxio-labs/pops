import { describe, expect, it } from 'vitest';

import { createClientConfig } from './ai-api-runtime-config';

describe('createClientConfig', () => {
  it('points the generated client at the shell /ai-api proxy path', () => {
    expect(createClientConfig({})).toMatchObject({ baseUrl: '/ai-api' });
  });

  it('preserves the caller-supplied config', () => {
    expect(createClientConfig({ headers: { 'x-trace': 'abc' } })).toMatchObject({
      baseUrl: '/ai-api',
      headers: { 'x-trace': 'abc' },
    });
  });

  it('discards a caller-supplied baseUrl rather than honouring it', () => {
    expect(createClientConfig({ baseUrl: 'http://localhost:3008' })).toMatchObject({
      baseUrl: '/ai-api',
    });
  });
});
