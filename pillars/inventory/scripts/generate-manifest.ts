/**
 * Manifest type generator for the inventory contract.
 *
 * Emits `src/contract/manifest.generated.ts` from the contract's
 * hand-maintained surface (`src/contract/types/item.ts`,
 * `src/contract/errors.ts`, `src/contract/router.ts`) plus the version
 * declared in `package.json`. The output is committed, then piped
 * through `oxfmt` so the committed file matches the workspace formatting
 * rules. CI's `verify:manifest` job re-renders + oxfmts in-memory and
 * byte-compares.
 *
 * The type-only imports below intentionally pull `Item`, `InventoryError`,
 * and `InventoryRouter` so that running the generator validates that the
 * source modules still expose the symbols the manifest names. A missing
 * or renamed export here makes the codegen fail loudly rather than
 * silently emitting a broken manifest.
 */
import { writeFileSync } from 'node:fs';

import {
  MANIFEST_OUTPUT_PATH,
  readContractVersion,
  renderFormattedManifest,
} from './render-manifest.js';

import type { InventoryError } from '../src/contract/errors.js';
import type { InventoryRouter } from '../src/contract/router.js';
import type { Item } from '../src/contract/types/item.js';

export type SurfaceAssertion = [Item, InventoryError, InventoryRouter];

const version = readContractVersion();
writeFileSync(MANIFEST_OUTPUT_PATH, renderFormattedManifest(version));
process.stdout.write(`[inventory] wrote ${MANIFEST_OUTPUT_PATH} (version=${version})\n`);
