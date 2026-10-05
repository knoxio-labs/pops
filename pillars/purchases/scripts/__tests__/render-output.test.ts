import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, expectTypeOf, it } from 'vitest';

import { readContractVersion, renderFormattedManifest } from '../render-manifest.js';

import type { PurchasesContract } from '../../src/contract/manifest.js';
import type { PurchaseSource } from '../../src/contract/types/purchase-source.js';
import type { Purchase } from '../../src/contract/types/purchase.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..', '..');
const GENERATED_PATH = resolve(PACKAGE_ROOT, 'src', 'contract', 'manifest.generated.ts');

describe('PurchasesContract manifest type generation', () => {
  it('exposes Purchase and PurchaseSource on the entity surface', () => {
    expectTypeOf<PurchasesContract['entities']['purchase']>().toEqualTypeOf<Purchase>();
    expectTypeOf<PurchasesContract['entities']['purchaseSource']>().toEqualTypeOf<PurchaseSource>();
  });

  it(
    're-renders with the package formatter config (no workspace config required)',
    { timeout: 30_000 },
    () => {
      expect(renderFormattedManifest(readContractVersion())).toBe(
        readFileSync(GENERATED_PATH, 'utf8')
      );
    }
  );
});
