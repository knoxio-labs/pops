import { buildPillarProxy, type PillarHandle } from '../client/proxy.js';

import type { CallResult } from '../client/errors.js';

/**
 * One fake procedure. Receives the call input verbatim — the SDK does no
 * validation — and answers with the `CallResult` the real pillar would.
 */
export type FakeProcedure = (input: unknown) => CallResult<unknown> | Promise<CallResult<unknown>>;

/** A tree of fake procedures, nested exactly as the real router nests. */
export type FakeRouterTree = {
  readonly [segment: string]: FakeProcedure | FakeRouterTree;
};

/**
 * Build a {@link PillarHandle} backed by a plain object of procedures instead
 * of by discovery + HTTP.
 *
 * The handle is a real pillar proxy — drilling, `orThrow()` and `callDynamic()`
 * behave exactly as they do in production, and an unrouted path answers
 * `contract-mismatch` the same way a pillar missing that operation would. Only
 * the network is replaced, so a consumer's fake cannot accidentally grant
 * itself procedures the real transport would refuse.
 *
 * This is what a consumer's tests should reach for instead of hand-writing a
 * structural stand-in: an object literal is not assignable to
 * `PillarHandle<TRouter>` (it has no `callDynamic`, and `TRouter` is deferred
 * at a generic call site), so those stand-ins can only be forced across with a
 * cast.
 *
 * @example
 * const finance = fakePillarHandle<FinanceRouter>('finance', {
 *   transactions: {
 *     list: (input) => ({ kind: 'ok', value: { data: rows } }),
 *   },
 * });
 * const result = await finance.transactions.list({ limit: 10 });
 */
export function fakePillarHandle<TRouter>(
  pillarId: string,
  routes: FakeRouterTree
): PillarHandle<TRouter> {
  const handle = buildPillarProxy(pillarId, async (path, input) => {
    if (path.length < 2) {
      return { kind: 'contract-mismatch', pillar: pillarId, actual: path.join('.') };
    }
    const procedure = resolveProcedure(routes, path);
    if (procedure === undefined) {
      return { kind: 'contract-mismatch', pillar: pillarId, expected: path.join('.') };
    }
    return procedure(input);
  });
  return handle as PillarHandle<TRouter>;
}

function resolveProcedure(
  routes: FakeRouterTree,
  path: readonly string[]
): FakeProcedure | undefined {
  let node: FakeProcedure | FakeRouterTree | undefined = routes;
  for (const segment of path) {
    if (node === undefined || typeof node === 'function') return undefined;
    node = node[segment];
  }
  return typeof node === 'function' ? node : undefined;
}
