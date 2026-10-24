/**
 * Stand-ins for the cerebrum REST reads its loader-mounted pages make on
 * mount, so a spec that only asserts a page mounted does not race the guard in
 * `e2e/fixtures/pillar-rest-guard.ts` against requests it never answered.
 *
 * Schemas are hand-mirrored from `pillars/cerebrum/openapi/cerebrum.openapi.json`
 * rather than imported: `shell-no-cross-internal` (`.dependency-cruiser.cjs`)
 * keeps the shell out of `@pops/cerebrum`'s contract package.
 */
import { z } from 'zod';

import { fulfilWith } from './pillar-rest';

import type { Page } from '@playwright/test';

const TemplatesResponseSchema = z
  .object({
    templates: z.array(
      z
        .object({
          name: z.string().min(1),
          description: z.string().min(1),
          required_fields: z.array(z.string().min(1)).optional(),
          suggested_sections: z.array(z.string().min(1)).optional(),
          default_scopes: z.array(z.string().min(1)).optional(),
          custom_fields: z
            .record(
              z.string(),
              z
                .object({
                  type: z.enum([
                    'string',
                    'number',
                    'boolean',
                    'string[]',
                    'number[]',
                    'boolean[]',
                  ]),
                  description: z.string().min(1),
                })
                .strict()
            )
            .optional(),
        })
        .strict()
    ),
  })
  .strict();

const ScopesResponseSchema = z
  .object({ scopes: z.array(z.object({ scope: z.string(), count: z.number().int() }).strict()) })
  .strict();

const TagsResponseSchema = z
  .object({ tags: z.array(z.object({ tag: z.string(), count: z.number().int() }).strict()) })
  .strict();

const EngramResponseSchema = z
  .object({
    engram: z
      .object({
        id: z.string().min(1),
        type: z.string().min(1),
        scopes: z.array(z.string()),
        tags: z.array(z.string()),
        links: z.array(z.string()),
        created: z.string(),
        modified: z.string(),
        source: z.string(),
        status: z.enum(['active', 'archived', 'consolidated', 'stale']),
        template: z.string().nullable(),
        title: z.string(),
        filePath: z.string(),
        contentHash: z.string(),
        wordCount: z.number().int(),
        customFields: z.record(z.string(), z.unknown()),
      })
      .strict(),
    body: z.string(),
  })
  .strict();

/** `GET /templates`, `/scopes` and `/tags`: the ingest form's dropdown reads. */
export async function stubCerebrumIngestOptions(page: Page): Promise<void> {
  await page.route(
    /\/cerebrum-api\/templates$/,
    fulfilWith(
      200,
      TemplatesResponseSchema,
      { templates: [{ name: 'note', description: 'A plain note' }] },
      'cerebrum.templates'
    )
  );
  await page.route(
    /\/cerebrum-api\/scopes$/,
    fulfilWith(200, ScopesResponseSchema, { scopes: [{ scope: 'personal', count: 1 }] }, 'scopes')
  );
  await page.route(
    /\/cerebrum-api\/tags$/,
    fulfilWith(200, TagsResponseSchema, { tags: [{ tag: 'idea', count: 1 }] }, 'cerebrum.tags')
  );
}

/** `GET /engrams/:id` for one engram, so its detail page renders a real record. */
export async function stubEngramDetail(page: Page, id: string): Promise<void> {
  await page.route(
    new RegExp(`/cerebrum-api/engrams/${id}$`),
    fulfilWith(
      200,
      EngramResponseSchema,
      {
        engram: {
          id,
          type: 'note',
          scopes: ['personal'],
          tags: ['idea'],
          links: [],
          created: '2026-10-01T09:00:00.000Z',
          modified: '2026-10-01T09:00:00.000Z',
          source: 'manual',
          status: 'active',
          template: null,
          title: 'Some engram',
          filePath: `notes/${id}.md`,
          contentHash: 'hash',
          wordCount: 2,
          customFields: {},
        },
        body: 'Some body.',
      },
      'cerebrum.engrams.get'
    )
  );
}
