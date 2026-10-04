/**
 * Manifest type generator for `@pops/cerebrum`.
 *
 * Writes `src/contract/manifest.generated.ts` from the fixed template in
 * `render-manifest.ts`, with the contract version pinned from `package.json`.
 * The committed output is piped through `oxfmt` so it matches the workspace
 * formatting rules; `verify:manifest` re-renders + oxfmts in-memory and
 * byte-compares.
 *
 * Imports below intentionally pull `Engram` and `CerebrumError` so that
 * running the generator validates that the source modules still expose the
 * symbols the manifest names. A missing or renamed export here makes the
 * codegen fail loudly rather than silently emitting a broken manifest.
 */
import { writeFileSync } from 'node:fs';

import {
  MANIFEST_OUTPUT_PATH,
  readContractVersion,
  renderFormattedManifest,
} from './render-manifest.js';

import type { CerebrumError } from '../src/contract/errors.js';
import type { Engram } from '../src/contract/types/engram.js';

export type SurfaceAssertion = [Engram, CerebrumError];

const version = readContractVersion();
writeFileSync(MANIFEST_OUTPUT_PATH, renderFormattedManifest(version));
process.stdout.write(`[cerebrum] wrote ${MANIFEST_OUTPUT_PATH} (version=${version})\n`);
