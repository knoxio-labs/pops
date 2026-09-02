/**
 * Registration with the `registry` pillar, lifted out of `server.ts` so the
 * failure path can be tested without binding a port.
 */
import { bootstrapPillar, type PillarBootstrapHandle } from '@pops/pillar-sdk/bootstrap';

import { buildDesignManifest } from './manifest.js';

/** The one call this module makes, injectable so a test can make it reject. */
export type BootstrapFn = typeof bootstrapPillar;

/**
 * Written as a call rather than passing `bootstrapPillar` itself as the
 * default. `scripts/ci/check-pillar-registration.mjs` accepts a call site and
 * refuses a bare mention, which is the distinction that makes it worth
 * having — a pillar that imports the SDK and never calls it does not register.
 */
const callBootstrap: BootstrapFn = (input) => bootstrapPillar(input);

/**
 * Register this pillar and return its handle, or `undefined` if registration
 * failed.
 *
 * Never rejects. It is called after `listen`, so an escaping rejection would
 * be unhandled and would take down a process that is already answering
 * comment requests — a registry that is slow to come up would become a crash
 * loop of a pillar whose threads were serving fine. The cost of resolving
 * `undefined` instead is a missing `/design-api/` block until the next boot:
 * the state this pillar shipped in, and what the registration guard exists to
 * notice.
 *
 * `bootstrapPillar` is deliberately not handed the Express app. It would
 * mount its own `/health` on top of the one `createDesignApiApp` already
 * serves, and mount it behind the identity middleware — in front of which
 * this pillar keeps `/health` so an unauthenticated container healthcheck can
 * reach it.
 */
export async function registerDesignPillar(
  version: string,
  baseUrl: string,
  bootstrap: BootstrapFn = callBootstrap
): Promise<PillarBootstrapHandle | undefined> {
  try {
    return await bootstrap({ manifest: buildDesignManifest(version), baseUrl });
  } catch (err) {
    console.error('[design-api] Registration failed; serving unregistered', err);
    return undefined;
  }
}
