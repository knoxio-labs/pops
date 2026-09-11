/**
 * `test`/`expect` for every shell e2e spec, extended with the one thing
 * `helpers/pillar-rest.ts` used to only document: an unrouted pillar REST
 * call now fails the test that made it instead of soft-failing to the
 * fallback path.
 *
 * The `page` fixture below installs `page.route(PILLAR_REST_URL, ...)` before
 * any spec code runs — in fixture setup, ahead of `beforeEach` and the test
 * body — so it is the OLDEST handler for any URL it matches. Playwright
 * dispatches a request to the most-recently-registered matching handler, so
 * every stub a spec (or `pillar-rest.ts`) registers afterwards shadows this
 * one for that URL; only a request nothing more specific claimed reaches it.
 * That is what makes this a fallback rather than a replacement for stubbing:
 * `failRegistry` and an explicit `route.abort()` still behave exactly as
 * before, because their own handler — registered later — is the one that
 * runs.
 *
 * A request that does reach it is recorded and answered with a 599 (a status
 * no real server sends, so a body slipping past this pattern reads
 * unmistakably as "the guard, not the pillar," in a trace or a screenshot),
 * and the fixture's teardown — which runs after the spec's own `afterEach`
 * hooks — throws if the record isn't empty, naming every method and URL that
 * got there.
 */
import { test as base, expect } from '@playwright/test';

import { PILLAR_REST_URL } from '../helpers/pillar-rest';

import type { Route } from '@playwright/test';

interface UnroutedPillarCall {
  readonly method: string;
  readonly url: string;
}

export interface PillarRestGuardOptions {
  /**
   * Named reason this spec's subject is the shell's behaviour when a pillar
   * REST call goes unanswered — a resilience test whose whole point is that
   * the backend says nothing back. `false` (the default) is what makes every
   * other spec's missing stub a caught mistake instead of a silent fallback.
   *
   * Set with `test.use({ allowUnroutedPillarRest: '<why>' })` at the
   * `describe` level, not inside a single `test(...)` — the option is read
   * once per test from `page` fixture setup.
   */
  allowUnroutedPillarRest: string | false;
}

export const test = base.extend<PillarRestGuardOptions>({
  allowUnroutedPillarRest: [false, { option: true }],

  // `runTest`, not Playwright's usual `use` — oxlint's react-hooks plugin
  // reads a called identifier literally named `use` as React's `use()` hook
  // regardless of scope, and this is a Playwright fixture, not a component.
  page: async ({ page, allowUnroutedPillarRest }, runTest) => {
    const unrouted: UnroutedPillarCall[] = [];

    await page.route(PILLAR_REST_URL, (route: Route) => {
      const request = route.request();
      unrouted.push({ method: request.method(), url: request.url() });
      return route.fulfill({
        status: 599,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'unstubbed-pillar-rest-call',
          message:
            `${request.method()} ${request.url()} reached the shared e2e catch-all with no ` +
            'spec-registered stub. Add a page.route stub for it, or if the fallback IS this ' +
            "spec's subject, opt out with test.use({ allowUnroutedPillarRest: '<why>' }).",
        }),
      });
    });

    await runTest(page);

    if (allowUnroutedPillarRest !== false || unrouted.length === 0) return;

    const calls = unrouted.map((call) => `  ${call.method} ${call.url}`).join('\n');
    throw new Error(`Unstubbed pillar REST call(s) reached the network:\n${calls}`);
  },
});

export { expect };
