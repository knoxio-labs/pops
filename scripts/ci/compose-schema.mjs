#!/usr/bin/env node
/**
 * The `infra/docker-compose.yml` shape shared by every scripts/ci guard that
 * parses it. `smoke-image.mjs` reads a service's `build` and `volumes` to
 * derive which `/data/...` paths a pillar's image must mount fresh;
 * `check-compose-cloudflare-access-env.test.ts` reads `environment` to assert
 * two services forward the Cloudflare Access identity vars. Both validate
 * against this one schema rather than each declaring its own narrower slice,
 * so a third field a future guard needs is one more optional property here,
 * not a third independently-drifting definition of what a Compose service is.
 *
 * Parsed with `js-yaml` and validated with `zod` by each caller — this module
 * only carries the shape, not the parse, since the two callers read the file
 * from different places (a path on disk vs. text already in hand for a test
 * fixture).
 */
import { z } from 'zod';

/**
 * One `volumes:` list entry: Compose's short `[source:]target[:mode]` string
 * form, or its long object form. Only `type`, `target` and `read_only` are
 * read; everything else passes through unexamined.
 */
export const ComposeVolumeEntrySchema = z.union([
  z.string(),
  z.object({
    type: z.string().optional(),
    target: z.string(),
    read_only: z.boolean().optional(),
  }),
]);

/** One `secrets:` entry in Compose's short or long syntax. */
export const ComposeSecretEntrySchema = z.union([
  z.string(),
  z.object({
    source: z.string(),
    target: z.string().optional(),
  }),
]);

/**
 * The value shape `ComposeVolumeEntrySchema` accepts, exported as a type so a
 * consumer that only touches one volume entry at a time (never the whole
 * schema or `zod` itself) can reference it via
 * `import('./compose-schema.mjs').ComposeVolumeEntry` without importing
 * either — one definition stays authoritative instead of a second file
 * hand-copying the union.
 *
 * @typedef {z.infer<typeof ComposeVolumeEntrySchema>} ComposeVolumeEntry
 */

/**
 * A service's `healthcheck:`. Only `test` is read — the probe itself is what a
 * guard asserts on; `interval`/`timeout`/`retries` are tuning. `test` takes
 * Compose's string form or its `['CMD', ...]` / `['CMD-SHELL', ...]` list form.
 */
export const ComposeHealthcheckSchema = z.object({
  test: z.union([z.string(), z.array(z.string())]).optional(),
});

/**
 * A Compose service: `build`, `volumes`, `secrets`, `environment` and
 * `healthcheck` — every field a scripts/ci guard has needed out of
 * `infra/docker-compose.yml` so far. Nullable because `some-service:` with no
 * value is valid Compose (typically paired with a YAML anchor elsewhere), not
 * a shape to reject.
 */
export const ComposeServiceSchema = z
  .object({
    build: z.union([z.string(), z.object({ dockerfile: z.string().optional() })]).optional(),
    volumes: z.array(ComposeVolumeEntrySchema).optional(),
    secrets: z.array(ComposeSecretEntrySchema).optional(),
    environment: z.record(z.string(), z.unknown()).optional(),
    healthcheck: ComposeHealthcheckSchema.optional(),
  })
  .nullable();

/**
 * A Compose manifest: only the `services:` map matters here. Required rather
 * than optional — every real Compose file declares one, so a document that
 * does not (an empty or malformed `infra/docker-compose.yml`) should fail
 * loudly here rather than parse to `{ services: undefined }` and let a guard
 * read that as zero services and pass.
 */
export const ComposeFileSchema = z.object({
  services: z.record(z.string(), ComposeServiceSchema),
});
