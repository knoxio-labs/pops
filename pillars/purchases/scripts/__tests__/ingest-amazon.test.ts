/**
 * The key-before-parse ordering: a missing key must fail before the bundle
 * is read, not after. `readFileSync` is mocked so a regression back to
 * parse-then-check would show up as an unexpected call rather than as a
 * slower test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INGEST_API_KEY_ENV } from '../backfill.js';

vi.mock('node:fs', () => ({ readFileSync: vi.fn() }));
vi.mock('../../src/ingest/amazon/index.js', () => ({
  AMAZON_SOURCE_ID: 'amazon',
  REFUND_DETAILS_BUNDLE_PATH: ['Your Returns & Refunds', 'Refund Details.csv'],
  parseAmazonOrderHistory: vi.fn(() => ({ orders: [], anomalies: [] })),
}));

const { readFileSync } = await import('node:fs');
const { main } = await import('../ingest-amazon.js');

const readFileSyncMock = vi.mocked(readFileSync);

beforeEach(() => {
  vi.unstubAllEnvs();
  readFileSyncMock.mockReset();
  readFileSyncMock.mockImplementation((path) => {
    if (String(path).endsWith('Refund Details.csv')) {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }
    return 'order id,order date\n';
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('main', () => {
  it('fails before reading the bundle when no key is configured', async () => {
    vi.stubEnv(INGEST_API_KEY_ENV, '');

    await expect(main(['/some/bundle'])).rejects.toThrow(new RegExp(INGEST_API_KEY_ENV));

    expect(readFileSyncMock).not.toHaveBeenCalled();
  });

  it('still requires the bundle path argument before touching the key', async () => {
    vi.stubEnv(INGEST_API_KEY_ENV, '');

    await expect(main([])).rejects.toThrow(/usage: pnpm ingest:amazon/);
  });

  it('--dry-run parses the bundle without a key', async () => {
    vi.stubEnv(INGEST_API_KEY_ENV, '');

    await expect(main(['/some/bundle', '--dry-run'])).resolves.toBeUndefined();

    expect(readFileSyncMock).toHaveBeenCalled();
  });
});
