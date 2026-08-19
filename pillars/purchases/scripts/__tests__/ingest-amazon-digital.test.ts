/**
 * The key-before-parse ordering, and the one file this CLI is allowed to
 * find missing. `readFileSync` is mocked so a regression back to
 * parse-then-check shows up as an unexpected call rather than as a slower
 * test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INGEST_API_KEY_ENV } from '../backfill.js';

vi.mock('node:fs', () => ({ readFileSync: vi.fn() }));
vi.mock('../../src/ingest/amazon-digital/index.js', () => ({
  AMAZON_DIGITAL_SOURCE_ID: 'amazon-digital',
  DIGITAL_ORDERS_BUNDLE_PATH: ['Your Amazon Orders', 'Digital Content Orders.csv'],
  DIGITAL_RETURNS_BUNDLE_PATH: ['Your Amazon Orders', 'Digital Returns.csv'],
  parseAmazonDigitalOrders: vi.fn(() => ({ orders: [], anomalies: [] })),
}));

const { readFileSync } = await import('node:fs');
const { main } = await import('../ingest-amazon-digital.js');

const readFileSyncMock = vi.mocked(readFileSync);

function absentReturnsFile(path: Parameters<typeof readFileSync>[0]): string {
  if (String(path).endsWith('Digital Returns.csv')) {
    const error = new Error('ENOENT') as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    throw error;
  }
  return 'Order ID,Order Date\n';
}

beforeEach(() => {
  vi.unstubAllEnvs();
  readFileSyncMock.mockReset();
  readFileSyncMock.mockImplementation(absentReturnsFile);
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

  it('names its own command in the usage message', async () => {
    vi.stubEnv(INGEST_API_KEY_ENV, '');

    await expect(main([])).rejects.toThrow(/usage: pnpm ingest:amazon-digital/);
  });

  it('--dry-run parses the bundle without a key', async () => {
    vi.stubEnv(INGEST_API_KEY_ENV, '');

    await expect(main(['/some/bundle', '--dry-run'])).resolves.toBeUndefined();

    expect(readFileSyncMock).toHaveBeenCalled();
  });

  it('tolerates a bundle carrying no digital returns at all', async () => {
    vi.stubEnv(INGEST_API_KEY_ENV, '');

    await expect(main(['/some/bundle', '--dry-run'])).resolves.toBeUndefined();
  });

  it('refuses a returns file that exists and cannot be read', async () => {
    // Proceeding would land every returned order at its full total, which
    // is indistinguishable from an account that returned nothing.
    vi.stubEnv(INGEST_API_KEY_ENV, '');
    readFileSyncMock.mockImplementation((path) => {
      if (String(path).endsWith('Digital Returns.csv')) {
        const error = new Error('EACCES') as NodeJS.ErrnoException;
        error.code = 'EACCES';
        throw error;
      }
      return 'Order ID,Order Date\n';
    });

    await expect(main(['/some/bundle', '--dry-run'])).rejects.toThrow(/EACCES/);
  });
});
