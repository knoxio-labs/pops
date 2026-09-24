/**
 * The media pillar, mounted through the shell's runtime loader (POPS-3226).
 *
 * media is the last pillar to leave the shell's static bundle map, and the one
 * whose published page list was furthest from its route table: eight entries
 * for twenty routes. The twelve missing ones are detail pages, the whole
 * rotation surface and four legacy redirects — none of which has a nav item,
 * so losing them would 404 silently.
 */
import { z } from 'zod';

import { expect, test } from './fixtures/pillar-rest-guard';
import { fulfilWith, stubShellBoot } from './helpers/pillar-rest';

/**
 * `GET /discovery/profile` 200 — mirrors `PreferenceProfileSchema`
 * (`pillars/media/src/contract/rest-discovery-schemas.ts`) inside the
 * `{ data }` envelope `rest-discovery.ts` declares. Hand-mirrored for the
 * reason `media-library-search-add-movie.spec.ts` gives.
 */
const PreferenceProfileResponseSchema = z
  .object({
    data: z
      .object({
        genreAffinities: z.array(
          z
            .object({
              genre: z.string(),
              avgScore: z.number(),
              movieCount: z.number(),
              totalComparisons: z.number(),
            })
            .strict()
        ),
        dimensionWeights: z.array(
          z
            .object({
              dimensionId: z.number(),
              name: z.string(),
              comparisonCount: z.number(),
              avgScore: z.number(),
            })
            .strict()
        ),
        genreDistribution: z.array(
          z.object({ genre: z.string(), watchCount: z.number(), percentage: z.number() }).strict()
        ),
        totalMoviesWatched: z.number(),
        totalComparisons: z.number(),
      })
      .strict(),
  })
  .strict();

const PREFERENCE_PROFILE = {
  data: {
    genreAffinities: [],
    dimensionWeights: [],
    genreDistribution: [
      { genre: 'Drama', watchCount: 3, percentage: 60 },
      { genre: 'Comedy', watchCount: 2, percentage: 40 },
    ],
    totalMoviesWatched: 5,
    totalComparisons: 0,
  },
};

test.describe('media — mounted by the runtime loader', () => {
  let errors: string[] = [];

  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await stubShellBoot(page);
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    expect(errors).toHaveLength(0);
  });

  test.describe('mount without the media API stubbed', () => {
    test.use({
      allowUnroutedPillarRest:
        'the assertion below is that the Library heading rendered, not that ' +
        'its data loaded — the full library-data flow is media-library-' +
        'search-add-movie.spec.ts’s job, with every one of these routes ' +
        'stubbed there',
    });

    test('the rail carries media and its library renders from the remote bundle', async ({
      page,
    }) => {
      await page.goto('/media');

      await expect(page.getByRole('button', { name: 'Media', exact: true })).toHaveAttribute(
        'aria-current',
        'page'
      );
      await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
    });
  });

  // Several of the twelve the old page list would have dropped. All are deep
  // links off a list or an old bookmark, so a 404 here is invisible from the
  // rail.
  test('a movie detail deep link mounts', async ({ page }) => {
    await page.goto('/media/movies/123');

    await expect(page).toHaveURL(/\/media\/movies\/123/);
    await expect(page.getByTestId('external-pillar-load-error')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /not found|404/i })).toHaveCount(0);
  });

  test('a season detail, three segments deep, mounts', async ({ page }) => {
    await page.goto('/media/tv/456/season/2');

    await expect(page).toHaveURL(/\/media\/tv\/456\/season\/2/);
    await expect(page.getByTestId('external-pillar-load-error')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /not found|404/i })).toHaveCount(0);
  });

  test('the rotation surface mounts, which the old page list omitted entirely', async ({
    page,
  }) => {
    await page.goto('/media/rotation/candidates');

    await expect(page).toHaveURL(/\/media\/rotation\/candidates/);
    await expect(page.getByTestId('external-pillar-load-error')).toHaveCount(0);
  });

  test('a legacy settings redirect still lands on the settings page', async ({ page }) => {
    await page.goto('/media/plex');

    await expect(page).toHaveURL(/\/settings#media\.plex/);
  });

  test.describe('discover with only the preference profile stubbed', () => {
    test.use({
      allowUnroutedPillarRest:
        'the assertion is that the preference profile chart drew, which reads ' +
        'only discovery/profile; the shelves, session and dismissed-list reads ' +
        'the page also fires are the media pillar’s own tests’ job',
    });

    /**
     * The profile imports `@pops/ui/theme/chart-colors`. When the import map
     * could not resolve that subpath, the page's chunk failed to link and its
     * error boundary rendered, with no load-error testid anywhere
     * (POPS-4034). A drawn chart is only reachable if it linked.
     */
    test('the preference profile chart renders', async ({ page }) => {
      await page.route(
        /\/media-api\/discovery\/profile$/,
        fulfilWith(200, PreferenceProfileResponseSchema, PREFERENCE_PROFILE, 'discovery.profile')
      );

      await page.goto('/media/discover');

      await expect(
        page.getByTestId('genre-distribution-chart').locator('svg.recharts-surface')
      ).toBeVisible();
    });
  });
});
