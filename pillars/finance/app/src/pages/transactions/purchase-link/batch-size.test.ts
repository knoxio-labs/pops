/**
 * The chunk size against the producer's own cap.
 *
 * This app cannot import `@pops/purchases` — that is the whole reason the leg
 * vendors a snapshot — so the cap cannot be a shared constant and would
 * otherwise be a number in two repositories' worth of files agreeing by
 * memory. The vendored spec is kept byte-identical to the producer's canonical
 * one by `scripts/ci/check-vendored-contracts.mjs`, so reading `maxItems` out
 * of it is reading the producer's cap: a producer that lowers it fails here on
 * the re-vendor rather than in a browser as a 400 on every page load.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { TRANSACTION_URI_BATCH_SIZE } from './usePurchaseLinkSummaries';

// Off the package root rather than `import.meta.url`: these suites run under
// jsdom, where that is an http URL and `fileURLToPath` refuses it.
const SPEC_PATH = resolve(process.cwd(), 'contracts/purchases.openapi.json');

/**
 * Only the one path down to the cap, parsed rather than asserted, so a spec
 * that moved the cap fails here saying which shape it no longer has instead of
 * reading `undefined` off something that is no longer an object.
 */
const CapSchema = z.object({
  paths: z.object({
    '/reconcile/links/batch': z.object({
      post: z.object({
        requestBody: z.object({
          content: z.object({
            'application/json': z.object({
              schema: z.object({
                properties: z.object({
                  transactionUris: z.object({ maxItems: z.int() }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  }),
});

function producerCap(): number {
  const spec = CapSchema.parse(JSON.parse(readFileSync(SPEC_PATH, 'utf8')));
  return spec.paths['/reconcile/links/batch'].post.requestBody.content['application/json'].schema
    .properties.transactionUris.maxItems;
}

describe('the batched lookup chunk size', () => {
  it('never exceeds the cap the vendored purchases contract declares', () => {
    expect(TRANSACTION_URI_BATCH_SIZE).toBeLessThanOrEqual(producerCap());
  });

  it('is large enough that an ordinary page costs one request', () => {
    // The transactions table pages at 50 and the page loads the whole list, so
    // a chunk smaller than a page would put the column back to several
    // requests per screen.
    expect(TRANSACTION_URI_BATCH_SIZE).toBeGreaterThanOrEqual(50);
  });
});
