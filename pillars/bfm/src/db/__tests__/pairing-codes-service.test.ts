/**
 * Minting and redemption, against a real migrated SQLite database.
 *
 * The single-use and expiry properties are asserted here rather than only
 * through HTTP because the redemption path has no route of its own yet — the
 * pairing exchange that calls it is POPS-1374. This is the layer that has to
 * hold the invariant regardless of who calls it.
 */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { pairingCodes } from '../schema.js';
import {
  generatePairingCode,
  hashPairingCode,
  issuePairingCode,
  normalizePairingCode,
  PAIRING_CODE_ALPHABET,
  PAIRING_CODE_LENGTH,
  redeemPairingCode,
} from '../services/pairing-codes.js';
import { openTempDb, requireRow } from './helpers.js';

import type { OpenedBfmDb } from '../index.js';

let opened: OpenedBfmDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
});

afterEach(() => {
  cleanup();
});

describe('generatePairingCode', () => {
  it('draws only from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i += 1) {
      for (const char of generatePairingCode().replaceAll('-', '')) {
        expect(PAIRING_CODE_ALPHABET).toContain(char);
      }
    }
  });

  it.each(['0', '1', 'I', 'L', 'O'])('never emits the confusable glyph %s', (glyph) => {
    const drawn = Array.from({ length: 200 }, () => generatePairingCode()).join('');
    expect(drawn).not.toContain(glyph);
  });

  it('carries the full code length once the display grouping is removed', () => {
    expect(generatePairingCode().replaceAll('-', '')).toHaveLength(PAIRING_CODE_LENGTH);
  });

  it('does not repeat across a large draw', () => {
    const drawn = new Set(Array.from({ length: 2_000 }, () => generatePairingCode()));
    expect(drawn.size).toBe(2_000);
  });

  /**
   * The rejection-sampling guard. `randomBytes % 31` would over-represent the
   * first nine glyphs by ~12%; this is loose enough not to flake on a fair
   * draw and tight enough to catch that bias.
   */
  it('draws roughly uniformly, so no glyph is systematically over-represented', () => {
    const counts = new Map<string, number>();
    const drawn = Array.from({ length: 4_000 }, () => generatePairingCode())
      .join('')
      .replaceAll('-', '');
    for (const char of drawn) counts.set(char, (counts.get(char) ?? 0) + 1);

    const expected = drawn.length / PAIRING_CODE_ALPHABET.length;
    expect(counts.size).toBe(PAIRING_CODE_ALPHABET.length);
    for (const [char, count] of counts) {
      expect(
        Math.abs(count - expected) / expected,
        `${char} appeared ${count} times against an expected ${expected}`
      ).toBeLessThan(0.25);
    }
  });
});

describe('normalizePairingCode', () => {
  it('accepts the code exactly as it was displayed', () => {
    const code = generatePairingCode();
    expect(normalizePairingCode(code)).toBe(code.replaceAll('-', ''));
  });

  it.each([
    ['lower case', (code: string) => code.toLowerCase()],
    ['no separators', (code: string) => code.replaceAll('-', '')],
    ['spaces instead of hyphens', (code: string) => code.replaceAll('-', ' ')],
    ['surrounding whitespace', (code: string) => `  ${code}\n`],
  ])('accepts a code typed with %s', (_label, mangle) => {
    const code = generatePairingCode();
    expect(normalizePairingCode(mangle(code))).toBe(code.replaceAll('-', ''));
  });

  it.each([
    ['empty', ''],
    ['too short', 'ABCD-EFGH'],
    ['too long', 'ABCD-EFGH-JKMN-PQRS'],
    ['a glyph no code can contain', 'ABCD-EFGH-JKM0'],
    ['punctuation', 'ABCD-EFGH-JK!N'],
  ])('rejects %s rather than guessing', (_label, input) => {
    expect(normalizePairingCode(input)).toBeNull();
  });
});

describe('issuePairingCode', () => {
  it('returns a code and persists exactly one row', () => {
    const issued = issuePairingCode(opened.db);

    expect(normalizePairingCode(issued.code)).not.toBeNull();
    expect(opened.db.select().from(pairingCodes).all()).toHaveLength(1);
  });

  it('persists the digest of the canonical code, not the code', () => {
    const issued = issuePairingCode(opened.db);

    const stored = requireRow(opened.db.select().from(pairingCodes).get(), 'issued code');
    expect(stored.codeHash).toBe(hashPairingCode(normalizePairingCode(issued.code) as string));
    expect(stored.codeHash).not.toContain(issued.code);
  });

  it('leaves the row unconsumed', () => {
    issuePairingCode(opened.db);

    expect(
      requireRow(opened.db.select().from(pairingCodes).get(), 'issued code').consumedAt
    ).toBeNull();
  });

  it('honours the TTL it was given', () => {
    const now = new Date('2026-08-08T10:00:00.000Z');

    const issued = issuePairingCode(opened.db, { ttlMs: 90_000, now: () => now });

    expect(issued.expiresAt).toBe('2026-08-08T10:01:30.000Z');
  });

  /**
   * A collision at ~59 bits will not happen. The retry exists so that if it
   * somehow did, the operator sees a code rather than a 500 from a primary-key
   * violation — which is only true if the retry actually retries.
   */
  it('redraws when a generated code collides with a live row', () => {
    const collides = generatePairingCode();
    const fresh = generatePairingCode();
    let call = 0;
    const generate = (): string => {
      call += 1;
      return call === 1 ? collides : fresh;
    };

    issuePairingCode(opened.db, { generate: () => collides });
    const issued = issuePairingCode(opened.db, { generate });

    expect(issued.code).toBe(fresh);
    expect(opened.db.select().from(pairingCodes).all()).toHaveLength(2);
  });

  it('gives up rather than looping forever when every draw collides', () => {
    const stuck = generatePairingCode();
    issuePairingCode(opened.db, { generate: () => stuck });

    expect(() => issuePairingCode(opened.db, { generate: () => stuck })).toThrow(
      /could not mint a unique pairing code/
    );
  });
});

describe('redeemPairingCode', () => {
  it('accepts an issued code', () => {
    const issued = issuePairingCode(opened.db);

    expect(redeemPairingCode(opened.db, issued.code)).toBe(true);
  });

  /** The acceptance criterion: one use, and one only. */
  it('rejects the second use of the same code', () => {
    const issued = issuePairingCode(opened.db);

    expect(redeemPairingCode(opened.db, issued.code)).toBe(true);
    expect(redeemPairingCode(opened.db, issued.code)).toBe(false);
    expect(redeemPairingCode(opened.db, issued.code)).toBe(false);
  });

  it('stamps the consumption instant on the row', () => {
    const issued = issuePairingCode(opened.db);
    const at = new Date('2026-08-08T10:05:00.000Z');

    redeemPairingCode(opened.db, issued.code, at);

    const stored = requireRow(opened.db.select().from(pairingCodes).get(), 'consumed code');
    expect(stored.consumedAt).toBe(at.toISOString());
  });

  it('rejects an expired code', () => {
    const issuedAt = new Date('2026-08-08T10:00:00.000Z');
    const issued = issuePairingCode(opened.db, { ttlMs: 60_000, now: () => issuedAt });

    expect(redeemPairingCode(opened.db, issued.code, new Date('2026-08-08T10:01:01.000Z'))).toBe(
      false
    );
  });

  it('accepts a code presented in the last second before it expires', () => {
    const issuedAt = new Date('2026-08-08T10:00:00.000Z');
    const issued = issuePairingCode(opened.db, { ttlMs: 60_000, now: () => issuedAt });

    expect(redeemPairingCode(opened.db, issued.code, new Date('2026-08-08T10:00:59.999Z'))).toBe(
      true
    );
  });

  it('leaves an expired code unconsumed, rather than burning it on a failed attempt', () => {
    const issuedAt = new Date('2026-08-08T10:00:00.000Z');
    const issued = issuePairingCode(opened.db, { ttlMs: 60_000, now: () => issuedAt });

    redeemPairingCode(opened.db, issued.code, new Date('2026-08-08T11:00:00.000Z'));

    expect(
      requireRow(opened.db.select().from(pairingCodes).get(), 'expired code').consumedAt
    ).toBeNull();
  });

  it.each([
    ['never issued', () => generatePairingCode()],
    ['malformed', () => 'not-a-pairing-code'],
    ['empty', () => ''],
  ])('rejects a code that was %s', (_label, present) => {
    issuePairingCode(opened.db);

    expect(redeemPairingCode(opened.db, present())).toBe(false);
  });

  it('accepts the code however the handset typed it', () => {
    const issued = issuePairingCode(opened.db);

    expect(redeemPairingCode(opened.db, issued.code.toLowerCase().replaceAll('-', ' '))).toBe(true);
  });

  it('consumes only the presented code, leaving its siblings live', () => {
    const first = issuePairingCode(opened.db);
    const second = issuePairingCode(opened.db);

    redeemPairingCode(opened.db, first.code);

    const survivor = requireRow(
      opened.db
        .select()
        .from(pairingCodes)
        .where(
          eq(pairingCodes.codeHash, hashPairingCode(normalizePairingCode(second.code) as string))
        )
        .get(),
      'unconsumed sibling'
    );
    expect(survivor.consumedAt).toBeNull();
  });

  /**
   * Composability with POPS-1374, which must consume the code and insert the
   * device atomically: a rolled-back transaction has to leave the code
   * spendable, or a failed pairing burns the operator's code for nothing.
   */
  it('is undone with the transaction it was called inside', () => {
    const issued = issuePairingCode(opened.db);

    expect(() =>
      opened.db.transaction((tx) => {
        expect(redeemPairingCode(tx, issued.code)).toBe(true);
        throw new Error('device insert failed');
      })
    ).toThrow('device insert failed');

    expect(
      requireRow(opened.db.select().from(pairingCodes).get(), 'rolled-back code').consumedAt
    ).toBeNull();
    expect(redeemPairingCode(opened.db, issued.code)).toBe(true);
  });
});
