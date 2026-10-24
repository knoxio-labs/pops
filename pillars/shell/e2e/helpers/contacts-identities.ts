import { z } from 'zod';

import { fulfilWith } from './pillar-rest';

import type { Page } from '@playwright/test';

const ResolveRequestSchema = z.object({ ids: z.array(z.string()).max(500) }).strict();
const ResolveResponseSchema = z
  .object({
    data: z.array(z.object({ id: z.string(), canonicalId: z.string().nullable() }).strict()),
    revision: z.number().int().nonnegative(),
  })
  .strict();

/**
 * Stub contacts' ResolveBody/ResolveResponse OpenAPI contract with explicit fixture identities.
 * Responses retain request order and duplicates; null means confirmed missing, while undeclared ids fail.
 */
export async function stubCanonicalContacts(
  page: Page,
  identities: ReadonlyMap<string, string | null>
): Promise<void> {
  await page.route(/\/contacts-api\/entities\/resolve$/, (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body: unknown = route.request().postDataJSON();
    const { ids } = ResolveRequestSchema.parse(body);
    const data = ids.map((id) => {
      const canonicalId = identities.get(id);
      if (canonicalId === undefined) throw new Error(`Undeclared contact identity fixture: ${id}`);
      return { id, canonicalId };
    });
    return fulfilWith(
      200,
      ResolveResponseSchema,
      { data, revision: 1 },
      'contacts.entitiesResolve'
    )(route);
  });
}
