/**
 * `test`/`expect` for shell E2E specs, with a context-level fallback for
 * unstubbed pillar REST calls. Page-level stubs take precedence over context
 * routes, and the fallback survives `page.unrouteAll()` cleanup.
 *
 * Recent script and pillar REST requests settle before teardown checks the
 * fallback records. The event-driven wait has a 100ms quiet window and a
 * five-second bound; tests with no recent relevant requests do not wait.
 */
import { test as base, expect } from '@playwright/test';

import { PILLAR_REST_URL, REGISTRY_HEALTH_URL } from '../helpers/pillar-rest';

import type { Request, Route } from '@playwright/test';

interface UnroutedPillarCall {
  readonly method: string;
  readonly url: string;
}

/** Test-level controls for the shell's shared pillar REST network guard. */
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

const SETTLEMENT_TIMEOUT_MS = 5_000;
const SETTLEMENT_QUIET_PERIOD_MS = 100;

function shouldTrackRequest(request: Request): boolean {
  return request.resourceType() === 'script' || PILLAR_REST_URL.test(request.url());
}

interface RequestSettlement {
  readonly pending: ReadonlySet<Request>;
  readonly lastActivityAt: () => number | undefined;
  readonly revision: () => number;
  readonly waitForChange: (revision: number, timeoutMs: number) => Promise<boolean>;
}

async function settlePendingRequests(settlement: RequestSettlement): Promise<void> {
  const deadline = Date.now() + SETTLEMENT_TIMEOUT_MS;

  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      const pending = [...settlement.pending]
        .map((request) => `  ${request.method()} ${request.url()}`)
        .join('\n');
      throw new Error(
        `Shell E2E did not settle within ${SETTLEMENT_TIMEOUT_MS}ms after relevant network activity:\n${pending}`
      );
    }

    const lastActivityAt = settlement.lastActivityAt();
    const quietRemaining =
      lastActivityAt === undefined ? 0 : SETTLEMENT_QUIET_PERIOD_MS - (Date.now() - lastActivityAt);
    if (settlement.pending.size === 0 && quietRemaining <= 0) return;

    const timeout = settlement.pending.size > 0 ? remaining : Math.min(remaining, quietRemaining);
    const changed = await settlement.waitForChange(settlement.revision(), timeout);
    if (!changed && settlement.pending.size === 0 && Date.now() < deadline) return;
    if (!changed) {
      const pending = [...settlement.pending]
        .map((request) => `  ${request.method()} ${request.url()}`)
        .join('\n');
      throw new Error(
        `Shell E2E did not settle within ${SETTLEMENT_TIMEOUT_MS}ms after relevant network activity:\n${pending}`
      );
    }
  }
}

export const test = base.extend<PillarRestGuardOptions>({
  allowUnroutedPillarRest: [false, { option: true }],

  page: async ({ page, context, allowUnroutedPillarRest }, runTest) => {
    const unrouted: UnroutedPillarCall[] = [];
    const pendingRequests = new Set<Request>();
    const requestChangeWaiters = new Set<() => void>();
    let requestRevision = 0;
    let lastRequestActivity: number | undefined;
    const notifyRequestChange = () => {
      requestRevision += 1;
      for (const wake of requestChangeWaiters) wake();
    };
    const trackRequest = (request: Request) => {
      if (!shouldTrackRequest(request)) return;
      pendingRequests.add(request);
      lastRequestActivity = Date.now();
      notifyRequestChange();
    };
    const settleRequest = (request: Request) => {
      if (!pendingRequests.delete(request)) return;
      lastRequestActivity = Date.now();
      notifyRequestChange();
    };
    const waitForChange = (revision: number, timeoutMs: number): Promise<boolean> =>
      new Promise((resolve) => {
        if (requestRevision !== revision) {
          resolve(true);
          return;
        }

        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        const wake = () => {
          if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
          requestChangeWaiters.delete(wake);
          resolve(true);
        };
        timeoutHandle = setTimeout(() => {
          requestChangeWaiters.delete(wake);
          resolve(false);
        }, timeoutMs);
        requestChangeWaiters.add(wake);
        if (requestRevision !== revision) wake();
      });

    page.on('request', trackRequest);
    page.on('requestfinished', settleRequest);
    page.on('requestfailed', settleRequest);

    await context.route(PILLAR_REST_URL, (route: Route) => {
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

    await context.route(REGISTRY_HEALTH_URL, (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: 'test' }),
      })
    );

    try {
      await runTest(page);
      await settlePendingRequests({
        pending: pendingRequests,
        lastActivityAt: () => lastRequestActivity,
        revision: () => requestRevision,
        waitForChange,
      });
    } finally {
      page.off('request', trackRequest);
      page.off('requestfinished', settleRequest);
      page.off('requestfailed', settleRequest);
    }

    if (allowUnroutedPillarRest !== false || unrouted.length === 0) return;

    const calls = unrouted.map((call) => `  ${call.method} ${call.url}`).join('\n');
    throw new Error(`Unstubbed pillar REST call(s) reached the network:\n${calls}`);
  },
});

export { expect };
