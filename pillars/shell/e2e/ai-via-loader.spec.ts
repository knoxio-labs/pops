import { z } from 'zod';

/**
 * The ai pillar, mounted through the shell's runtime loader (POPS-3220).
 *
 * `@pops/app-ai` has left the shell's static bundle map, so everything the
 * rail and the router know about ai now arrives on the wire and the page
 * components come from a bundle the browser fetches at
 * `/ai-ui/ai.js`. Unit tests cover the descriptor synthesis and the bundle's
 * shape; what only a browser shows is that a real built bundle mounts under
 * the shell's router and renders.
 *
 * ai is the first migrated pillar whose surface is mostly redirects. Three of
 * its four pages render a `<Navigate>` out of the pillar, which is a component
 * that does nothing observable unless it is mounted inside the router the
 * shell built — exactly the coupling the loader sits in the middle of.
 */
import { expect, test } from './fixtures/pillar-rest-guard';
import { AccountsListResponseSchema } from './helpers/finance-accounts';
import { fulfilWith, stubShellBoot } from './helpers/pillar-rest';

import type { Page } from '@playwright/test';

const EmptyPagedListResponseSchema = z
  .object({
    data: z.array(z.unknown()),
    pagination: z
      .object({
        hasMore: z.boolean(),
        limit: z.number().int(),
        offset: z.number().int(),
        total: z.number().int(),
      })
      .strict(),
  })
  .strict();

function emptyPage(limit: number) {
  return { data: [], pagination: { total: 0, limit, offset: 0, hasMore: false } };
}

async function stubFinanceRules(page: Page): Promise<void> {
  await page.route(
    /\/contacts-api\/entities\?/,
    fulfilWith(200, EmptyPagedListResponseSchema, emptyPage(200), 'entities.list')
  );
  await page.route(
    /\/finance-api\/accounts\?/,
    fulfilWith(200, AccountsListResponseSchema, emptyPage(500), 'accounts.list')
  );
  await page.route(
    /\/finance-api\/corrections\?/,
    fulfilWith(200, EmptyPagedListResponseSchema, emptyPage(50), 'corrections.list')
  );
}

test.describe('ai — mounted by the runtime loader', () => {
  let errors: string[] = [];

  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await stubShellBoot(page);
  });

  test.afterEach(() => {
    expect(errors).toHaveLength(0);
  });

  test.describe('mount without the ai API stubbed', () => {
    test.use({
      allowUnroutedPillarRest:
        'the heading is the same string on the loaded and the failed-to-load ' +
        'branch of the page, so this asserts the component mounted WITHOUT ' +
        'depending on the ai API being stubbed — see the comment below',
    });

    test('the rail carries ai and its dashboard renders from the remote bundle', async ({
      page,
    }) => {
      await page.goto('/ai');

      // `exact`, because a substring match on "AI" also finds "Collapse app
      // rail" and the assertion fails as ambiguous rather than as absent.
      await expect(page.getByRole('button', { name: 'AI', exact: true })).toHaveAttribute(
        'aria-current',
        'page'
      );
      // The heading is the same string on the loaded and the failed-to-load
      // branch of the page, so this asserts the component mounted without
      // depending on the ai API being stubbed.
      await expect(page.getByRole('heading', { name: 'AI Observability' })).toBeVisible();
    });
  });

  /**
   * The redirect pages are the ones most likely to be dropped from the page
   * list as "not real pages". A dropped page is not a broken render, it is a
   * 404 on a URL that used to work — with no rail entry pointing at it to look
   * wrong. This is the only tier that can tell the two apart.
   */
  test('a redirect page mounted from the bundle navigates out of the pillar', async ({ page }) => {
    await stubFinanceRules(page);
    await page.goto('/ai/rules');

    await expect(page).toHaveURL(/\/finance\/rules/);
    await expect(page.getByRole('heading', { name: 'Categorisation Rules' })).toBeVisible();
  });

  test('the settings redirect keeps its fragment', async ({ page }) => {
    await page.goto('/ai/config');

    await expect(page).toHaveURL(/\/settings#ai\.config/);
  });
});
