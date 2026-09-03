import { describe, expect, it } from 'vitest';

import { LOCAL_DESIGN_API_URL, resolveDesignApiProxyConfig } from './dev-proxy';

describe('resolveDesignApiProxyConfig', () => {
  it('defaults to the local design-api when POPS_DESIGN_FEEDBACK_URL is unset', () => {
    expect(resolveDesignApiProxyConfig({})).toEqual({ target: LOCAL_DESIGN_API_URL });
  });

  it('lets an explicit POPS_DESIGN_FEEDBACK_URL win over the local default', () => {
    expect(
      resolveDesignApiProxyConfig({ POPS_DESIGN_FEEDBACK_URL: 'https://design.example.com' })
    ).toEqual({ target: 'https://design.example.com' });
  });

  it('treats a blank POPS_DESIGN_FEEDBACK_URL as unset', () => {
    expect(resolveDesignApiProxyConfig({ POPS_DESIGN_FEEDBACK_URL: '  ' })).toEqual({
      target: LOCAL_DESIGN_API_URL,
    });
  });

  it('attaches the service-token headers for a remote target when both halves are set', () => {
    expect(
      resolveDesignApiProxyConfig({
        POPS_DESIGN_FEEDBACK_URL: 'https://design.example.com',
        CF_ACCESS_CLIENT_ID: 'client-id',
        CF_ACCESS_CLIENT_SECRET: 'client-secret',
      })
    ).toEqual({
      target: 'https://design.example.com',
      headers: {
        'CF-Access-Client-Id': 'client-id',
        'CF-Access-Client-Secret': 'client-secret',
      },
    });
  });

  it('omits headers when only one half of the service token is set', () => {
    expect(
      resolveDesignApiProxyConfig({
        POPS_DESIGN_FEEDBACK_URL: 'https://design.example.com',
        CF_ACCESS_CLIENT_ID: 'client-id',
      })
    ).toEqual({ target: 'https://design.example.com' });
  });
});
