/**
 * Tests for the Plexus registry: TOML parsing, credential resolution,
 * and manifest building (PRD-090, US-03).
 */
import { describe, expect, it, vi } from 'vitest';

// Mock the cerebrum instance module to avoid pulling in @pops/db-types.
vi.mock('../../instance.js', () => ({
  getEngramRoot: () => '/tmp/test-engrams',
}));

const { buildManifests, parsePlexusToml, resolveCredential, resolveCredentials } =
  await import('../registry.js');

// ---------------------------------------------------------------------------
// resolveCredential / resolveCredentials
// ---------------------------------------------------------------------------

describe('resolveCredential', () => {
  it('resolves env: prefixed values from process.env', () => {
    vi.stubEnv('TEST_SECRET', 's3cret');
    expect(resolveCredential('password', 'env:TEST_SECRET')).toBe('s3cret');
    vi.unstubAllEnvs();
  });

  it('throws when the referenced env var is not set', () => {
    // Ensure the variable does not exist.
    delete process.env['MISSING_VAR'];
    expect(() => resolveCredential('api_key', 'env:MISSING_VAR')).toThrow(
      "Environment variable 'MISSING_VAR' not found"
    );
  });

  it('returns plain values as-is when not prefixed with env:', () => {
    expect(resolveCredential('host', 'imap.example.com')).toBe('imap.example.com');
  });
});

describe('resolveCredentials', () => {
  it('resolves all entries in a credentials map', () => {
    vi.stubEnv('PLX_USER', 'alice');
    vi.stubEnv('PLX_PASS', 'hunter2');
    const result = resolveCredentials({ username: 'env:PLX_USER', password: 'env:PLX_PASS' });
    expect(result).toEqual({ username: 'alice', password: 'hunter2' });
    vi.unstubAllEnvs();
  });

  it('returns empty object for undefined credentials', () => {
    expect(resolveCredentials(undefined)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// parsePlexusToml
// ---------------------------------------------------------------------------

describe('parsePlexusToml', () => {
  it('parses a valid plexus.toml with one adapter', () => {
    const toml = `
[adapters.email]
module = "builtin:email"
enabled = true

[adapters.email.settings]
protocol = "imap"
host = "imap.gmail.com"
port = 993

[adapters.email.credentials]
username = "env:PLEXUS_EMAIL_USER"
password = "env:PLEXUS_EMAIL_PASS"
`;
    const result = parsePlexusToml(toml);
    expect(result.adapters).toBeDefined();
    const email = result.adapters?.['email'];
    expect(email).toBeDefined();
    expect(email?.module).toBe('builtin:email');
    expect(email?.enabled).toBe(true);
    expect(email?.settings).toEqual({ protocol: 'imap', host: 'imap.gmail.com', port: 993 });
    expect(email?.credentials).toEqual({
      username: 'env:PLEXUS_EMAIL_USER',
      password: 'env:PLEXUS_EMAIL_PASS',
    });
  });

  it('parses multiple adapters', () => {
    const toml = `
[adapters.email]
module = "builtin:email"
enabled = true

[adapters.github]
module = "builtin:github"
enabled = false
`;
    const result = parsePlexusToml(toml);
    expect(Object.keys(result.adapters ?? {})).toHaveLength(2);
    expect(result.adapters?.['github']?.enabled).toBe(false);
  });

  it('parses filters under an adapter', () => {
    const toml = `
[adapters.email]
module = "builtin:email"
enabled = true

[[adapters.email.filters]]
type = "exclude"
field = "subject"
pattern = "^\\\\[JIRA\\\\]"

[[adapters.email.filters]]
type = "include"
field = "from"
pattern = ".*@company\\\\.com$"
`;
    const result = parsePlexusToml(toml);
    const filters = result.adapters?.['email']?.filters;
    expect(filters).toHaveLength(2);
    expect(filters?.[0]).toEqual({ type: 'exclude', field: 'subject', pattern: '^\\[JIRA\\]' });
    expect(filters?.[1]).toEqual({ type: 'include', field: 'from', pattern: '.*@company\\.com$' });
  });

  it('returns empty adapters when no [adapters] section exists', () => {
    const result = parsePlexusToml('# empty config\n');
    expect(result.adapters).toEqual({});
  });

  it('throws on malformed TOML', () => {
    expect(() => parsePlexusToml('not valid [[')).toThrow();
  });

  it('defaults module to builtin:{name} when not specified', () => {
    const toml = `
[adapters.calendar]
enabled = true
`;
    const result = parsePlexusToml(toml);
    expect(result.adapters?.['calendar']?.module).toBe('builtin:calendar');
  });

  it('defaults enabled to true when not specified', () => {
    const toml = `
[adapters.rss]
module = "builtin:rss"
`;
    const result = parsePlexusToml(toml);
    expect(result.adapters?.['rss']?.enabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildManifests
// ---------------------------------------------------------------------------

describe('buildManifests', () => {
  it('builds manifests from parsed TOML', () => {
    const toml = parsePlexusToml(`
[adapters.email]
module = "builtin:email"
enabled = true

[adapters.email.settings]
host = "imap.example.com"

[adapters.email.credentials]
user = "env:EMAIL_USER"

[[adapters.email.filters]]
type = "exclude"
field = "subject"
pattern = "^spam"
`);
    const manifests = buildManifests(toml);
    expect(manifests).toHaveLength(1);
    const first = manifests[0];
    expect(first).toBeDefined();
    expect(first?.name).toBe('email');
    expect(first?.module).toBe('builtin:email');
    expect(first?.enabled).toBe(true);
    expect(first?.settings).toEqual({ host: 'imap.example.com' });
    expect(first?.credentials).toEqual({ user: 'env:EMAIL_USER' });
    expect(first?.filters).toHaveLength(1);
    expect(first?.filters[0]).toEqual({
      filterType: 'exclude',
      field: 'subject',
      pattern: '^spam',
    });
  });

  it('returns empty array when no adapters are defined', () => {
    const manifests = buildManifests({ adapters: undefined });
    expect(manifests).toEqual([]);
  });
});
