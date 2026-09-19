/**
 * Live `ai`-pillar client backing `codes/suggest`'s ranking (Inventory
 * ADR-002 Phase C, POPS-4081).
 *
 * `codes/suggest`'s deterministic candidates (`../sync/codes.ts`) are never
 * held — each is a free number above the highest one any item, tombstones
 * included, already carries with the chosen stem. This client only ever
 * asks the `ai` pillar to REORDER that already-safe set into the order it
 * judges most likely to be typed next; it never accepts a code the `ai`
 * pillar invents. That is deliberate, not a missing feature: an open-ended
 * ranking response would need its own held-code check against the database
 * on every call, and a malformed or adversarial response could otherwise
 * hand back a code a live item already carries. Validating that the
 * response is a permutation of the candidates it was given is cheap and
 * total, so `rankCodeCandidates` degrades to `undefined` (the caller then
 * keeps the deterministic order) on anything else: no key configured, the
 * call times out or fails, or the response isn't a same-set permutation.
 *
 * `/server`, not `/client` (POPS-2021): the handle is built through
 * {@link credentialled} from `../pillars/outbound.js`, which attaches this
 * pillar's service-account key as `X-API-Key` and answers `null` instead of
 * throwing when this process holds none.
 *
 * The `ai` pillar has no candidate-ranking route today — see this slice's
 * report. The router type and path below are this pillar's proposal for
 * that route, kept narrow so `scripts/ci/check-cross-pillar-expectations.mjs`
 * has a single, literal call site to pin once the route exists.
 */
import { isOk, pillar, type PillarHandle } from '@pops/pillar-sdk/server';

import {
  credentialled,
  credentialRejectedMessage,
  UNAUTHORIZED_REASON,
} from '../pillars/outbound.js';

/** The `ai` pillar id, as registered with the registry. */
export const AI_PILLAR_ID = 'ai';

/** What `codes/suggest` is ranking candidates for. */
export interface RankCodesContext {
  readonly name: string;
  readonly typeKey?: string;
}

/**
 * Typed handle over the subset of the `ai` pillar router inventory calls.
 * Declared as a `type` (not `interface`) so it satisfies the SDK proxy's
 * `Record<string, unknown>` constraint, mirroring the same note on finance's
 * `ContactsRouter` (`pillars/finance/src/api/contacts/client.ts`).
 */
export type AiRouter = {
  codes: {
    rank: (input: {
      name: string;
      typeKey?: string;
      candidates: string[];
    }) => Promise<{ data: { ranked: string[] } }>;
  };
};

export interface AiClient {
  /**
   * Rank `candidates` for `context`, most-likely-first.
   *
   * @returns The same candidates reordered, or `undefined` when there is no
   *   service-account key, the call fails or times out, or the response is
   *   not a same-set permutation of `candidates` (never a smaller, larger,
   *   or substituted set — that would risk surfacing a held code). Callers
   *   must fall back to the input order on `undefined`, never treat it as
   *   "no suggestions".
   */
  rankCodeCandidates(
    candidates: readonly string[],
    context: RankCodesContext
  ): Promise<string[] | undefined>;
}

/**
 * Whether `ranked` carries exactly the same codes as `candidates`, in any
 * order. Exported so the caller (`../rest/sync-handlers.ts`) re-checks it
 * too: `codes/suggest`'s "never a held code" guarantee must hold for
 * whatever {@link AiClient} is injected, not only for {@link createAiClient}'s
 * own implementation.
 */
export function isPermutation(candidates: readonly string[], ranked: readonly string[]): boolean {
  if (ranked.length !== candidates.length) return false;
  const remaining = new Map<string, number>();
  for (const code of candidates) remaining.set(code, (remaining.get(code) ?? 0) + 1);
  for (const code of ranked) {
    const count = remaining.get(code) ?? 0;
    if (count === 0) return false;
    remaining.set(code, count - 1);
  }
  return true;
}

/**
 * Build the default `ai` client over the pillar SDK. `handleFactory` is
 * injectable purely so unit tests can supply a stub router; production
 * passes the real, credentialled `pillar('ai')` — built fresh per call, not
 * once at construction, for the same reason `createContactsClient` does
 * (`pillar()` refuses to build a handle without a key, and constructing
 * eagerly would move a missing key from a degraded client to a pillar that
 * will not boot).
 */
export function createAiClient(
  handleFactory: () => PillarHandle<AiRouter> | null = () =>
    credentialled(AI_PILLAR_ID, () => pillar<AiRouter>('ai'))
): AiClient {
  return {
    async rankCodeCandidates(
      candidates: readonly string[],
      context: RankCodesContext
    ): Promise<string[] | undefined> {
      const handle = handleFactory();
      if (handle === null) return undefined;
      let result;
      try {
        result = await handle.codes.rank({
          name: context.name,
          ...(context.typeKey === undefined ? {} : { typeKey: context.typeKey }),
          candidates: [...candidates],
        });
      } catch {
        // A thrown network/timeout error degrades exactly like any other
        // non-ok `CallResult`: ranking is an enhancement, never a
        // requirement for `codes/suggest` to answer.
        return undefined;
      }
      if (!isOk(result)) {
        if (result.kind === UNAUTHORIZED_REASON) {
          console.error(credentialRejectedMessage(AI_PILLAR_ID, 'codes.rank'));
        }
        return undefined;
      }
      const ranked = result.value.data.ranked;
      return isPermutation(candidates, ranked) ? ranked : undefined;
    },
  };
}
