/**
 * The key-before-parse ordering: a missing key must fail before the export
 * is read, not after. `readFileSync` is mocked so a regression back to
 * parse-then-check would show up as an unexpected call rather than as a
 * slower test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INGEST_API_KEY_ENV } from '../backfill.js';

vi.mock('node:fs', () => ({ readFileSync: vi.fn() }));
vi.mock('../../src/ingest/woolworths/index.js', () => ({
  WOOLWORTHS_SOURCE_ID: 'woolworths',
  parseWoolworthsExport: vi.fn(() => ({
    capturedAt: '2026-08-07T00:00:00.000Z',
    purchases: [],
    anomalies: [],
  })),
}));

const { readFileSync } = await import('node:fs');
const { main } = await import('../ingest-woolworths.js');

const readFileSyncMock = vi.mocked(readFileSync);

beforeEach(() => {
  vi.unstubAllEnvs();
  readFileSyncMock.mockReset();
  readFileSyncMock.mockReturnValue('{}');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('main', () => {
  it('fails before reading the export when no key is configured', async () => {
    vi.stubEnv(INGEST_API_KEY_ENV, '');

    await expect(main(['/some/export.json'])).rejects.toThrow(new RegExp(INGEST_API_KEY_ENV));

    expect(readFileSyncMock).not.toHaveBeenCalled();
  });

  it('still requires the export path argument before touching the key', async () => {
    vi.stubEnv(INGEST_API_KEY_ENV, '');

    await expect(main([])).rejects.toThrow(/usage: pnpm ingest:woolworths/);
  });

  it('--dry-run parses the export without a key', async () => {
    vi.stubEnv(INGEST_API_KEY_ENV, '');

    await expect(main(['/some/export.json', '--dry-run'])).resolves.toBeUndefined();

    expect(readFileSyncMock).toHaveBeenCalled();
  });
});
