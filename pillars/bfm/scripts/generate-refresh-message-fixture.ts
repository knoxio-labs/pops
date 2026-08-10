/**
 * Regenerates `contracts/refresh-message-v1.json` — the committed vector for
 * the exact bytes a handset signs on `POST /devices/refresh`.
 *
 * The format is this pillar's to define: `src/api/auth/refresh-exchange.ts`'s
 * header is its only prose description and this server is the party that
 * rejects a wrong one. So the vector is produced HERE, from that file's own
 * `refreshSignatureMessage()` and the same `hashRefreshToken()` the exchange
 * uses to find the row. Reassembling the string in this script would make it a
 * third statement of the format, and a third thing to get wrong.
 *
 * `clients/ios` vendors a byte-identical copy and asserts the same bytes from
 * Swift, which is the only thing standing between a format change and a fleet
 * of handsets whose signatures stop verifying — a failure that reaches the app
 * as an ordinary `401`. Prefer `mise run fixture:refresh-message` from the repo
 * root: it runs this and re-vendors that copy, and
 * `scripts/ci/check-refresh-message-fixture.mjs` fails if only one of the two
 * moved.
 *
 * Unlike the device-signature vector beside it, this one is deterministic — no
 * key is drawn and no signature made — so re-running it against an unchanged
 * format rewrites identical bytes and replaces nothing a reviewer had read.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  REFRESH_SIGNATURE_DOMAIN,
  refreshSignatureMessage,
} from '../src/api/auth/refresh-exchange.js';
import { hashRefreshToken } from '../src/db/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The inputs, fixed rather than drawn.
 *
 * A vector regenerated with fresh randomness would move bytes a reviewer
 * already read for a reason that has nothing to do with the format, which is
 * the whole cost this fixture avoids paying.
 *
 * Both sit in the base64url alphabet the real values use — `refresh-challenge.ts`
 * and `generateRefreshToken` both emit base64url — while reading as obviously
 * synthetic, so neither can be mistaken for a leaked credential in a diff.
 */
const NONCE = 'Zk9uY2UtZm9yLXRoZS10ZXN0LXZlY3Rvcg';
const REFRESH_TOKEN = 'pops-test-refresh-token-not-a-real-credential';

/**
 * True in BOTH locations: the file is committed byte-identically to
 * `pillars/bfm/contracts/` and to `clients/ios/Contracts/`, so a note saying
 * "this copy" is wrong in one of them. Name the paths instead.
 */
const NOTE =
  'Pins the exact bytes an iOS handset signs for POST /devices/refresh. The format is the ' +
  "BFM's to define, so pillars/bfm/contracts/ holds the canonical copy and " +
  'clients/ios/Contracts/ holds a vendored one; a CI guard fails on any drift between them. ' +
  'The ECDSA encodings applied to these bytes are pinned separately, by device-signature-v1.json.';

function main(): void {
  const refreshTokenSha256Hex = hashRefreshToken(REFRESH_TOKEN);
  const fixture = {
    domain: REFRESH_SIGNATURE_DOMAIN,
    messageBase64: refreshSignatureMessage(NONCE, refreshTokenSha256Hex).toString('base64'),
    nonce: NONCE,
    note: NOTE,
    refreshToken: REFRESH_TOKEN,
    refreshTokenSha256Hex,
    version: 1,
  };

  const outFile = resolve(HERE, '..', 'contracts', 'refresh-message-v1.json');
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');

  execFileSync('pnpm', ['exec', 'oxfmt', '--write', outFile], {
    cwd: resolve(HERE, '..'),
    stdio: 'inherit',
  });

  process.stdout.write(`[bfm] wrote the refresh-message vector to ${outFile}\n`);
}

main();
