/**
 * The page size against the producer's own cap.
 *
 * This app cannot import `@pops/purchases` — that is the whole reason the leg
 * vendors a snapshot — so the cap cannot be a shared constant and would
 * otherwise be a number in two repositories' worth of files agreeing by
 * memory. The vendored spec is kept byte-identical to the producer's canonical
 * one by `scripts/ci/check-vendored-contracts.mjs`, so reading the `limit`
 * parameter's `maximum` out of it is reading the producer's cap: a producer
 * that lowers it fails here on the re-vendor rather than in a browser as a 400
 * on every page load.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { LINKS_PAGE_SIZE } from './usePurchasesForTransaction';

// Off the package root rather than `import.meta.url`: these suites run under
// jsdom, where that is an http URL and `fileURLToPath` refuses it.
const SPEC_PATH = resolve(process.cwd(), 'contracts/purchases.openapi.json');

const ParameterSchema = z.object({
  name: z.string(),
  schema: z.object({ maximum: z.int().optional() }).optional(),
});

/**
 * Only the one path down to the cap, parsed rather than asserted, so a spec
 * that moved the cap fails here saying which shape it no longer has instead of
 * reading `undefined` off something that is no longer an object.
 */
const CapSchema = z.object({
  paths: z.object({
    '/reconcile/links': z.object({
      get: z.object({ parameters: z.array(ParameterSchema) }),
    }),
  }),
});

function producerCap(): number {
  const spec = CapSchema.parse(JSON.parse(readFileSync(SPEC_PATH, 'utf8')));
  const limitParam = spec.paths['/reconcile/links'].get.parameters.find(
    (parameter) => parameter.name === 'limit'
  );
  const maximum = limitParam?.schema?.maximum;
  if (maximum === undefined) throw new Error("'/reconcile/links' lost its limit parameter's cap");
  return maximum;
}

describe('the reverse-lookup page size', () => {
  it('matches the cap the vendored purchases contract declares', () => {
    expect(LINKS_PAGE_SIZE).toBe(producerCap());
  });
});
