/**
 * Pairing-code minting and redemption — the credential half of turning an
 * unpaired phone into a `devices` row.
 *
 * ## Why the code is this long
 *
 * `pairing_codes` stores only a digest, which POPS-1366's schema header noted
 * is *not* on its own enough: a code short enough to read off a screen is
 * short enough to enumerate offline against `code_hash`. That header left the
 * choice to this file, between a keyed digest under a mounted pepper and a
 * code with enough entropy that enumeration is pointless. This is the second.
 *
 * Twelve characters over a 31-glyph alphabet is ~59 bits. Against a code that
 * lives for {@link DEFAULT_PAIRING_CODE_TTL_MS}, an attacker holding a stolen
 * `bfm.db` has no tractable offline attack, and one who does not hold it faces
 * a rate-limited endpoint. The alternative bought a shorter code at the price
 * of a boot-critical secret to provision, rotate and lose; the QR is the
 * primary path anyway, so the extra four characters cost nothing real.
 *
 * A plain SHA-256 is therefore the right digest and a password hash would be
 * the wrong one: there is no low-entropy input to slow an attacker down over,
 * and pairing is a latency-visible interactive step.
 *
 * ## The alphabet
 *
 * `0`/`O` and `1`/`I`/`L` are excluded outright rather than folded together on
 * read. Crockford base32 maps the confusable pair onto one value, which only
 * works when both glyphs are in the alphabet; excluding all five means a code
 * simply never contains a glyph a reader could mistake, so there is nothing to
 * fold. 31 is not a power of two, hence the rejection sampling in
 * {@link generatePairingCode} — `randomBytes % 31` would bias the first nine
 * letters upward.
 */
import { createHash, randomBytes } from 'node:crypto';

import { and, eq, gt, isNull } from 'drizzle-orm';

import { pairingCodes } from '../schema.js';

import type { BfmDb } from '../open-bfm-db.js';

/** Digits and letters with every confusable glyph (`0`, `1`, `I`, `L`, `O`) removed. */
export const PAIRING_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Characters of entropy per code. 12 over a 31-glyph alphabet is ~59 bits. */
export const PAIRING_CODE_LENGTH = 12;

/** Hyphen every this many characters when rendering, the way redeem codes read. */
export const PAIRING_CODE_GROUP_SIZE = 4;

/** Minutes, not hours — the window an unredeemed code is worth guessing in. */
export const DEFAULT_PAIRING_CODE_TTL_MS = 5 * 60 * 1000;

/**
 * Largest multiple of the alphabet size that fits in a byte. Bytes at or above
 * it are discarded rather than folded, which is what keeps the draw uniform.
 */
const REJECTION_CEILING =
  Math.floor(256 / PAIRING_CODE_ALPHABET.length) * PAIRING_CODE_ALPHABET.length;

/**
 * Draw a fresh code, CSPRNG-backed and uniform over the alphabet.
 *
 * Returned grouped (`XXXX-XXXX-XXXX`) because that is how it is read aloud and
 * typed. The separators are presentation only — {@link hashPairingCode}
 * digests the canonical ungrouped form, so a caller may present it either way.
 */
export function generatePairingCode(): string {
  const chars: string[] = [];
  while (chars.length < PAIRING_CODE_LENGTH) {
    for (const byte of randomBytes(PAIRING_CODE_LENGTH)) {
      if (byte >= REJECTION_CEILING) continue;
      chars.push(PAIRING_CODE_ALPHABET[byte % PAIRING_CODE_ALPHABET.length] as string);
      if (chars.length === PAIRING_CODE_LENGTH) break;
    }
  }

  const groups: string[] = [];
  for (let i = 0; i < chars.length; i += PAIRING_CODE_GROUP_SIZE) {
    groups.push(chars.slice(i, i + PAIRING_CODE_GROUP_SIZE).join(''));
  }
  return groups.join('-');
}

/**
 * Reduce a presented code to its canonical form, or `null` if it could not
 * have been issued by {@link generatePairingCode}.
 *
 * Case is folded and separators (hyphens, spaces) dropped, so a handset that
 * typed the code as it was displayed and one that typed it run together are
 * the same code. Anything else — a wrong length, or a glyph outside the
 * alphabet — is `null` rather than a best-effort guess: a code carrying a
 * character no code can contain is not a typo worth rescuing.
 */
export function normalizePairingCode(presented: string): string | null {
  const stripped = presented.replaceAll(/[\s-]/gu, '').toUpperCase();
  if (stripped.length !== PAIRING_CODE_LENGTH) return null;
  for (const char of stripped) {
    if (!PAIRING_CODE_ALPHABET.includes(char)) return null;
  }
  return stripped;
}

/** The stored form: SHA-256 of the canonical code, hex. See the header for why not a KDF. */
export function hashPairingCode(canonical: string): string {
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export interface IssuedPairingCode {
  /** Plaintext, grouped for display. Returned exactly once and never persisted. */
  code: string;
  /** ISO-8601 UTC instant the code stops being redeemable. */
  expiresAt: string;
}

export interface IssuePairingCodeOptions {
  /** Lifetime of the minted code. Defaults to {@link DEFAULT_PAIRING_CODE_TTL_MS}. */
  ttlMs?: number;
  /** Injectable clock, for tests. */
  now?: () => Date;
  /** Injectable generator, for tests. Defaults to {@link generatePairingCode}. */
  generate?: () => string;
}

/**
 * How many fresh draws to try before giving up on a hash collision.
 *
 * At ~59 bits against a table holding minutes of codes this will never fire in
 * production. It exists because the alternative to retrying is a primary-key
 * violation surfacing as a 500 on an operator's screen.
 */
const MAX_ISSUE_ATTEMPTS = 3;

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed|PRIMARY KEY/i.test(err.message);
}

/**
 * Mint a code, persist only its digest, and hand the plaintext back to the
 * caller. There is no second chance to read it.
 */
export function issuePairingCode(
  db: BfmDb,
  options: IssuePairingCodeOptions = {}
): IssuedPairingCode {
  const {
    ttlMs = DEFAULT_PAIRING_CODE_TTL_MS,
    now = () => new Date(),
    generate = generatePairingCode,
  } = options;

  const issuedAt = now();
  const createdAt = issuedAt.toISOString();
  const expiresAt = new Date(issuedAt.getTime() + ttlMs).toISOString();

  for (let attempt = 0; attempt < MAX_ISSUE_ATTEMPTS; attempt += 1) {
    const code = generate();
    const canonical = normalizePairingCode(code);
    if (canonical === null) {
      throw new Error('[bfm] pairing code generator produced a code it cannot normalize');
    }
    try {
      // `createdAt` is written rather than left to the column default. The
      // table's CHECK compares it against `expiresAt`, and the default is
      // SQLite's clock while `expiresAt` comes from this one — two clocks
      // either side of an enforced inequality is a constraint violation
      // waiting for a caller that passes its own `now`.
      db.insert(pairingCodes)
        .values({ codeHash: hashPairingCode(canonical), createdAt, expiresAt })
        .run();
      return { code, expiresAt };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new Error(`[bfm] could not mint a unique pairing code in ${MAX_ISSUE_ATTEMPTS} attempts`);
}

/**
 * Spend a presented code, atomically.
 *
 * The whole check — known, unexpired, unconsumed — is the `WHERE` clause of a
 * single `UPDATE`, so two requests racing the same code cannot both see it
 * unconsumed: SQLite serialises the writes and the loser matches zero rows.
 * A read-then-write would have that race, and the race is the one thing
 * single-use exists to prevent.
 *
 * Takes a {@link BfmDb}, which a transaction handle also satisfies, so the
 * pairing exchange (POPS-1374) can compose this into the same transaction as
 * its device insert.
 *
 * Returns `true` when the code was spent by this call. Every failure reason
 * collapses to `false` on purpose — unknown, expired and already-consumed must
 * be indistinguishable to a caller, or a short code becomes an oracle.
 */
export function redeemPairingCode(db: BfmDb, presented: string, now: Date = new Date()): boolean {
  const canonical = normalizePairingCode(presented);
  if (canonical === null) return false;

  const at = now.toISOString();
  const result = db
    .update(pairingCodes)
    .set({ consumedAt: at })
    .where(
      and(
        eq(pairingCodes.codeHash, hashPairingCode(canonical)),
        isNull(pairingCodes.consumedAt),
        gt(pairingCodes.expiresAt, at)
      )
    )
    .run();

  return result.changes === 1;
}
