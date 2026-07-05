/**
 * Shared `FOOD_INGEST_DIR` resolution for the food-api ingest surface
 * (`ingest-storage.ts` writes screenshots here; `ingest-procedures-control.ts`
 * reads them back for retry). `pops-worker-food` reads the SAME directory
 * from its own `FOOD_INGEST_DIR` (see `worker/config.ts`) — the two
 * processes must agree on this path or the worker can't see files the API
 * wrote.
 *
 * In production an unset `FOOD_INGEST_DIR` used to fall back to a relative
 * `./data/food/ingest` resolved against the process CWD — an ephemeral
 * path the worker never mounts. Fail loud there instead of silently
 * writing to a path nothing backs up or shares.
 */
import { resolve } from 'node:path';

const DEFAULT_FOOD_INGEST_DIR = './data/food/ingest';

export function resolveFoodIngestRoot(): string {
  const configured = process.env['FOOD_INGEST_DIR'];
  if (configured !== undefined && configured.length > 0) {
    return resolve(configured);
  }
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(
      'FOOD_INGEST_DIR is not configured. Set it to the same path mounted on pops-worker-food ' +
        '(the shared food-ingest volume) — an unset value would silently fall back to an ' +
        'ephemeral, unshared directory.'
    );
  }
  return resolve(DEFAULT_FOOD_INGEST_DIR);
}
