import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PORT,
  DEFAULT_SQLITE_PATH,
  resolveBarcodeSqlitePath,
  resolvePort,
  resolveSelfBaseUrl,
  shouldSelfRegister,
  resolveUserAgentContact,
} from '../boot-env.js';

describe('barcode boot environment', () => {
  it('resolves the default port and database path', () => {
    expect(resolvePort({})).toBe(DEFAULT_PORT);
    expect(resolveBarcodeSqlitePath({})).toBe(DEFAULT_SQLITE_PATH);
  });

  it('prefers the pillar path over a shared path', () => {
    expect(
      resolveBarcodeSqlitePath({
        SQLITE_PATH: '/data/shared/pops.db',
        BARCODE_SQLITE_PATH: '/data/barcode/custom.db',
      })
    ).toBe('/data/barcode/custom.db');
    expect(resolveBarcodeSqlitePath({ SQLITE_PATH: '/data/shared/pops.db' })).toBe(
      '/data/shared/barcode.db'
    );
  });

  it('resolves the self origin and exact registration flag', () => {
    expect(resolveSelfBaseUrl(3016, {})).toBe('http://localhost:3016');
    expect(resolveSelfBaseUrl(3016, { BARCODE_SELF_BASE_URL: 'http://barcode-api:3016' })).toBe(
      'http://barcode-api:3016'
    );
    expect(shouldSelfRegister({ POPS_REGISTRY_ENABLED: 'true' })).toBe(true);
    expect(shouldSelfRegister({ POPS_REGISTRY_ENABLED: 'TRUE' })).toBe(false);
  });

  it('requires the Open Library user-agent contact', () => {
    expect(() => resolveUserAgentContact({})).toThrow(/BARCODE_USER_AGENT_CONTACT/u);
    expect(() => resolveUserAgentContact({ BARCODE_USER_AGENT_CONTACT: '  ' })).toThrow(
      /BARCODE_USER_AGENT_CONTACT/u
    );
    expect(resolveUserAgentContact({ BARCODE_USER_AGENT_CONTACT: ' ci@example.invalid ' })).toBe(
      'ci@example.invalid'
    );
  });
});
