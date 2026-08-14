#!/usr/bin/env node
/**
 * Refresh signed-message format guard.
 *
 * A handset proves possession of its Secure Enclave key by signing these bytes
 * for `POST /devices/refresh`:
 *
 * ```
 * BFM-REFRESH-V1\n<nonce>\n<sha256(refreshToken), lowercase hex>
 * ```
 *
 * The format belongs to the BFM — `pillars/bfm/src/api/auth/refresh-exchange.ts`
 * is the party that rejects a wrong one and its header is the only prose
 * description of it — and `clients/ios` reproduces the construction in Swift.
 * No compiler sees both. A disagreement over the domain prefix, the separator
 * count, the digest or the hex case produces a signature that does not verify,
 * which reaches the app as an ordinary `401`: indistinguishable from an expired
 * token, with nothing in either log to tell them apart.
 *
 * So the bytes are pinned by a committed vector both languages read, and that
 * vector exists twice:
 *
 *   - `pillars/bfm/contracts/refresh-message-v1.json` — canonical, because the
 *     format is the BFM's to define;
 *   - `clients/ios/Contracts/refresh-message-v1.json` — vendored, because
 *     ADR-043 forbids the client reading a path under `pillars/`, the same
 *     consumer-vendors-a-copy shape ADR-033 established for OpenAPI snapshots.
 *
 * The direction is the mirror of `check-device-signature-fixture.mjs` next
 * door, which pins the ECDSA *encodings* applied to these bytes: only CryptoKit
 * can produce a real signature, so there the client is the producer. Two
 * fixtures, two owners, one shared copy-set mechanism in `fixture-copies.mjs`.
 *
 * ## What this guard adds over the two unit suites
 *
 * The BFM asserts `refreshSignatureMessage()` against the vector and the Swift
 * package asserts `RefreshSignatureMessage.bytes(nonce:refreshToken:)` against
 * it, so an accidental change on either side is already red. Neither catches a
 * change that is made **and regenerated**, because the vector then moves with
 * it. That is what the assertions below are for: they restate the properties
 * the format exists to have, so a regenerated fixture that quietly dropped one
 * fails here rather than shipping.
 *
 * The load-bearing ones are the properties the format's own docs argue for and
 * which a plain equality check would sail past — the preimage carries the
 * token's DIGEST and never the token, and the digest is lowercase because
 * Node's `digest('hex')` is.
 *
 * Usage:
 *   node scripts/ci/check-refresh-message-fixture.mjs
 *   node scripts/ci/check-refresh-message-fixture.mjs --self-test
 *
 * Exit 0 = every copy is present, identical and holds the format.
 */

import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkCopies,
  repoCopyReader,
  resolveCanonical,
  selfTestCopyHandling,
} from './fixture-copies.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/**
 * Every copy of the vector. Repo-relative so the failure messages, the
 * self-test and the unit suite all name the same strings.
 *
 * Adding a copy is adding an entry here: the equality check is pairwise against
 * the canonical one, so a third consumer needs no new code.
 */
export const FIXTURE_COPIES = Object.freeze([
  Object.freeze({
    role: 'canonical (the BFM defines the format)',
    path: 'pillars/bfm/contracts/refresh-message-v1.json',
  }),
  Object.freeze({
    role: 'vendored (inside the iOS client, ADR-043)',
    path: 'clients/ios/Contracts/refresh-message-v1.json',
  }),
]);

/** The server rejects a wrong message, so the server holds the original. */
const CANONICAL_ROOT = 'pillars/bfm/';

export const CANONICAL = resolveCanonical(FIXTURE_COPIES, CANONICAL_ROOT);

/**
 * The exact paths `FIXTURE_COPIES` is known to carry today, as literals —
 * typed by hand, not derived from `FIXTURE_COPIES` itself. `FIXTURE_COPIES`
 * is what every check above walks, so an entry silently dropped from it (a
 * copy quietly stops being checked) or silently added to it (an unreviewed
 * copy starts being trusted) changes what the guard covers without changing
 * anything a test derived from `FIXTURE_COPIES` could ever notice — that test
 * would just walk the new, wrong list. A literal pin is the only thing that
 * can catch it: it stays exactly what it says even when the list it is
 * checking loses or gains an entry.
 *
 * A change to this set landing without a matching update here is the
 * friction ADR-045 asks for — visible on the commit that makes it, not a
 * silently-widened or -narrowed floor.
 */
export const KNOWN_FIXTURE_COPY_PATHS = [
  'pillars/bfm/contracts/refresh-message-v1.json',
  'clients/ios/Contracts/refresh-message-v1.json',
];

/**
 * Self-test: `FIXTURE_COPIES` still declares exactly {@link KNOWN_FIXTURE_COPY_PATHS}.
 *
 * Every other self-test half exercises what a copy's CONTENTS must hold; none
 * of them can see a copy dropped from — or added to — the list they all walk,
 * because they all walk that same list. This is the one check in the file
 * that compares `FIXTURE_COPIES` against something not derived from itself.
 *
 * @returns {boolean}
 */
function selfTestCopySet() {
  const declared = FIXTURE_COPIES.map((copy) => copy.path).toSorted();
  const expected = [...KNOWN_FIXTURE_COPY_PATHS].toSorted();

  const missing = expected.filter((path) => !declared.includes(path));
  const extra = declared.filter((path) => !expected.includes(path));
  const ok = missing.length === 0 && extra.length === 0;

  if (!ok) {
    console.error('SELF-TEST FAILED (copy set): FIXTURE_COPIES does not match the pinned set.');
    for (const path of missing) console.error(`  missing (pinned, not declared): ${path}`);
    for (const path of extra) console.error(`  extra (declared, not pinned):    ${path}`);
    console.error(
      '  if this is a deliberate addition/removal, update KNOWN_FIXTURE_COPY_PATHS in the ' +
        'same commit; if it is not, FIXTURE_COPIES has drifted unexpectedly.'
    );
  } else {
    console.log(
      `self-test OK — declares exactly the ${expected.length} pinned fixture copy path(s).`
    );
  }
  return ok;
}

/** The format, restated here so the fixture cannot redefine itself. */
const CONTRACT = Object.freeze({
  version: 1,
  domain: 'BFM-REFRESH-V1',
});

/** UTF-8, exactly two of these, and no trailing one. */
const SEPARATOR = '\n';
const SEPARATOR_COUNT = 2;

/** Lowercase hex SHA-256, as `hashRefreshToken` returns it. */
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

/**
 * @typedef {object} Fixture
 * @property {number} version
 * @property {string} domain
 * @property {string} nonce
 * @property {string} refreshToken
 * @property {string} refreshTokenSha256Hex
 * @property {string} messageBase64
 */

/**
 * Run every assertion against a parsed fixture.
 *
 * Pure and dependency-free so the self-test can drive it with a deliberately
 * corrupted fixture and observe it fail.
 *
 * @param {Fixture} fixture
 * @returns {string[]} One message per failed assertion; empty means the fixture holds.
 */
export function checkFixture(fixture) {
  /** @type {string[]} */
  const failures = [];

  for (const [field, expected] of Object.entries(CONTRACT)) {
    const actual = fixture[/** @type {keyof typeof CONTRACT} */ (field)];
    if (actual !== expected) {
      failures.push(
        `${field}: fixture says ${JSON.stringify(actual)}, contract says ${JSON.stringify(expected)}`
      );
    }
  }

  for (const field of /** @type {const} */ ([
    'nonce',
    'refreshToken',
    'refreshTokenSha256Hex',
    'messageBase64',
  ])) {
    if (typeof fixture[field] !== 'string' || fixture[field].length === 0) {
      failures.push(`${field}: missing or not a non-empty string`);
    }
  }
  if (failures.length > 0) return failures;

  const digest = createHash('sha256').update(fixture.refreshToken, 'utf8').digest('hex');
  if (fixture.refreshTokenSha256Hex !== digest) {
    failures.push(
      'refreshTokenSha256Hex is not SHA-256 of refreshToken — the vector does not describe its own inputs'
    );
  }
  if (!DIGEST_PATTERN.test(fixture.refreshTokenSha256Hex)) {
    failures.push(
      'refreshTokenSha256Hex is not 64 lowercase hex characters — Node’s digest(‘hex’) is ' +
        'lowercase, and uppercase would be a different string and therefore a different signature'
    );
  }

  const messageBytes = Buffer.from(fixture.messageBase64, 'base64');
  if (messageBytes.toString('base64') !== fixture.messageBase64) {
    failures.push(
      'messageBase64 is not the canonical base64 of the bytes it decodes to — the two copies ' +
        'would agree while the two languages decoded different lengths'
    );
  }

  const message = messageBytes.toString('utf8');
  const expected = `${CONTRACT.domain}${SEPARATOR}${fixture.nonce}${SEPARATOR}${fixture.refreshTokenSha256Hex}`;
  if (message !== expected) {
    failures.push(
      `messageBase64 does not decode to the signed message the format defines.\n` +
        `      expected: ${JSON.stringify(expected)}\n` +
        `      actual:   ${JSON.stringify(message)}`
    );
  }

  // Each of these holds whenever the equality above does. They are asserted
  // anyway because they are what the format is FOR, and the case this guard
  // exists to catch is a format change that was regenerated — where the
  // equality moves with the change and only a restated property notices.
  const separators = message.split(SEPARATOR).length - 1;
  if (separators !== SEPARATOR_COUNT) {
    failures.push(
      `the message carries ${separators} newline separator(s), expected ${SEPARATOR_COUNT}`
    );
  }
  if (message.endsWith(SEPARATOR)) {
    failures.push('the message ends in a newline — the format has no trailing separator');
  }
  if (message.includes(fixture.refreshToken)) {
    failures.push(
      'the message carries the refresh token itself. The preimage binds the token’s DIGEST so ' +
        'that anything logging or tracing what was signed cannot leak the credential'
    );
  }

  return failures;
}

/**
 * Check every committed copy: present, byte-identical, and holding the format.
 *
 * @param {(repoRelativePath: string) => string | null} read Reads a copy, or null if absent.
 * @returns {string[]}
 */
export function checkAllCopies(read) {
  return checkCopies(FIXTURE_COPIES, CANONICAL.path, read, checkFixture);
}

/**
 * Self-test: prove the assertions actually fail on a vector broken in each of
 * the ways this guard exists to catch.
 *
 * Every corruption below is one a regeneration would happily produce, because
 * those are the ones the two unit suites cannot see.
 *
 * @param {Fixture} valid A fixture already known to pass.
 * @returns {boolean}
 */
function selfTest(valid) {
  /** @param {string} text */
  const asMessage = (text) => Buffer.from(text, 'utf8').toString('base64');
  const rebuilt = (/** @type {Fixture} */ f) =>
    `${f.domain}${SEPARATOR}${f.nonce}${SEPARATOR}${f.refreshTokenSha256Hex}`;
  const upper = valid.refreshTokenSha256Hex.toUpperCase();

  /** @type {[string, Fixture][]} */
  const corruptions = [
    [
      'the domain prefix changed on the pillar side',
      {
        ...valid,
        messageBase64: asMessage(rebuilt(valid).replace(CONTRACT.domain, 'BFM-REFRESH-V2')),
      },
    ],
    [
      'the domain prefix changed everywhere, including the pin',
      {
        ...valid,
        domain: 'BFM-REFRESH-V2',
        messageBase64: asMessage(rebuilt({ ...valid, domain: 'BFM-REFRESH-V2' })),
      },
    ],
    [
      'a trailing newline appeared',
      { ...valid, messageBase64: asMessage(`${rebuilt(valid)}${SEPARATOR}`) },
    ],
    [
      'the separators collapsed to one',
      {
        ...valid,
        messageBase64: asMessage(
          `${valid.domain}${SEPARATOR}${valid.nonce}${valid.refreshTokenSha256Hex}`
        ),
      },
    ],
    [
      'the digest went uppercase',
      {
        ...valid,
        refreshTokenSha256Hex: upper,
        messageBase64: asMessage(rebuilt({ ...valid, refreshTokenSha256Hex: upper })),
      },
    ],
    [
      'the token is signed directly instead of its digest',
      {
        ...valid,
        messageBase64: asMessage(
          `${valid.domain}${SEPARATOR}${valid.nonce}${SEPARATOR}${valid.refreshToken}`
        ),
      },
    ],
    [
      'the digest no longer belongs to the token beside it',
      { ...valid, refreshToken: `${valid.refreshToken}-changed` },
    ],
    ['the version pin drifted', { ...valid, version: valid.version + 1 }],
    ['the nonce is not the one in the message', { ...valid, nonce: `${valid.nonce}x` }],
    ['a required field is gone', { ...valid, nonce: '' }],
  ];

  let ok = checkFixture(valid).length === 0;
  if (!ok) console.error('SELF-TEST FAILED: the committed vector does not pass its own checks');

  for (const [label, corrupted] of corruptions) {
    if (checkFixture(corrupted).length === 0) {
      console.error(`SELF-TEST FAILED: not caught — ${label}`);
      ok = false;
    }
  }

  if (!selfTestCopyHandling(FIXTURE_COPIES, CANONICAL.path, valid, checkFixture)) ok = false;

  if (ok) {
    console.log(
      `self-test OK — accepts the vector and rejects ${corruptions.length} corruptions of it.`
    );
  }
  return ok;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('Usage: node scripts/ci/check-refresh-message-fixture.mjs [--self-test]');
    process.exit(2);
  }

  /** @type {(message: string) => never} */
  const bail = (message) => {
    console.error(message);
    process.exit(1);
  };
  const read = repoCopyReader(repoRoot, bail);

  if (argv.includes('--self-test')) {
    // Both halves run even when one fails, so one invocation reports every
    // problem. The copy-set half needs no fixture at all, so it runs first.
    const copySet = selfTestCopySet();

    // The self-test needs a fixture it can corrupt, and the canonical copy is
    // the only source of one. Both failure modes are reported rather than
    // thrown: this runs as the FIRST step of its CI job, so an unhandled
    // SyntaxError here would report a broken fixture as a broken guard.
    const canonical = read(CANONICAL.path);
    if (canonical === null) bail(`FAIL — ${CANONICAL.path} does not exist`);
    /** @type {Fixture} */
    let valid;
    try {
      valid = JSON.parse(canonical);
    } catch (error) {
      bail(`FAIL — ${CANONICAL.path} is not parseable as JSON: ${String(error)}`);
    }
    process.exit(selfTest(valid) && copySet ? 0 : 1);
  }

  const failures = checkAllCopies(read);
  if (failures.length === 0) {
    console.log(
      `OK — ${String(FIXTURE_COPIES.length)} identical copies of the refresh-message vector, ` +
        `each decoding to ${CONTRACT.domain}\\n<nonce>\\n<sha256(refreshToken)>.`
    );
    process.exit(0);
  }

  console.error(`FAIL — ${String(failures.length)} refresh-message problem(s):`);
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(
    '\nThe iOS app and the BFM must build the same bytes, and every copy of the vector must ' +
      'be byte-identical. Regenerate with `mise run fixture:refresh-message`, which rebuilds the ' +
      'vector from the pillar’s own `refreshSignatureMessage()` and re-vendors the client’s ' +
      'copy. Changing the format means changing it on BOTH sides in the same commit.'
  );
  process.exit(1);
}

if (import.meta.main) {
  main();
}
