/**
 * Manifest type generator for `@pops/purchases`.
 *
 * Emits `src/contract/manifest.generated.ts` from the contract's
 * hand-maintained surface plus the version declared in `package.json`. The
 * output is committed, then piped through `oxfmt` so the committed file
 * matches the workspace formatting rules. `verify:manifest` re-renders +
 * oxfmts in-memory and byte-compares.
 *
 * The type imports below intentionally pull the symbols the manifest names
 * so that running the generator validates that the source modules still
 * expose them. A rename here fails loudly rather than silently emitting a
 * broken manifest. The server API layer (`src/api`) is internal and is
 * deliberately NOT part of the contract surface the manifest describes.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

import { MANIFEST_OUTPUT_PATH, readContractVersion, renderManifest } from './render-manifest.js';

import type { PurchasesError } from '../src/contract/errors.js';
import type { PurchaseSource } from '../src/contract/types/purchase-source.js';
import type { Purchase } from '../src/contract/types/purchase.js';

export type SurfaceAssertion = [Purchase, PurchaseSource, PurchasesError];

const version = readContractVersion();
const rendered = renderManifest(version);
writeFileSync(MANIFEST_OUTPUT_PATH, rendered);
execFileSync('pnpm', ['exec', 'oxfmt', '--write', MANIFEST_OUTPUT_PATH], {
  stdio: 'inherit',
});
process.stdout.write(`[purchases-contract] wrote ${MANIFEST_OUTPUT_PATH} (version=${version})\n`);
