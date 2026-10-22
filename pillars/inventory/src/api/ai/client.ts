/**
 * Live `ai`-pillar client behind `codes/suggest`.
 *
 * The `ai` pillar asks a model for codes that continue the owner's own
 * conventions. Its answer is advisory: the caller
 * (`../rest/sync-handlers.ts`) re-checks every code against this pillar's
 * database before offering it, because only inventory knows which codes are
 * held. `suggestCodes` answers `undefined` on anything short of a usable
 * response — no service-account key, a rejected credential, a timeout, a
 * non-2xx such as the `ai` pillar having no model key — and the caller then
 * falls back to deterministic numbering (`../sync/codes.ts`).
 *
 * `/server`, not `/client` (POPS-2021): the handle is built through
 * {@link credentialled} from `../pillars/outbound.js`, which attaches this
 * pillar's service-account key as `X-API-Key` and answers `null` instead of
 * throwing when this process holds none.
 */
import { isOk, pillar, type PillarHandle } from '@pops/pillar-sdk/server';

import {
  credentialled,
  credentialRejectedMessage,
  UNAUTHORIZED_REASON,
} from '../pillars/outbound.js';

import type { CodeSuggestionContext, ContextCode } from '../sync/code-context.js';

/** The `ai` pillar id, as registered with the registry. */
export const AI_PILLAR_ID = 'ai';

/** Above the `ai` pillar's own 15 s model timeout, so its 503 arrives before ours fires. */
const SUGGEST_TIMEOUT_MS = 20_000;

/**
 * Typed handle over the subset of the `ai` pillar router inventory calls.
 * Declared as a `type` (not `interface`) so it satisfies the SDK proxy's
 * `Record<string, unknown>` constraint.
 */
export type AiRouter = {
  codes: {
    suggest: (input: {
      item: { name: string; typeKey?: string; typeLabel?: string };
      destination?: { path: string[]; container?: { name: string; code?: string } };
      existing: ContextCode[];
      stem?: string;
      count: number;
    }) => Promise<{ data: { suggestions: { code: string; reason: string }[] } }>;
  };
};

export interface AiClient {
  /**
   * Ask the `ai` pillar for up to `count` codes for the item in `context`.
   *
   * @returns The suggested codes, best first, or `undefined` when no usable
   *   answer came back. The codes are NOT known to be free.
   */
  suggestCodes(context: CodeSuggestionContext, count: number): Promise<string[] | undefined>;
}

function toRequest(
  context: CodeSuggestionContext,
  count: number
): Parameters<AiRouter['codes']['suggest']>[0] {
  const { destination } = context;
  return {
    item: { ...context.item },
    ...(destination === undefined
      ? {}
      : {
          destination: {
            path: [...destination.path],
            ...(destination.container === undefined
              ? {}
              : { container: { ...destination.container } }),
          },
        }),
    existing: [...context.existing],
    ...(context.stem === undefined ? {} : { stem: context.stem }),
    count,
  };
}

/**
 * Build the default `ai` client over the pillar SDK. `handleFactory` is
 * injectable so unit tests can supply a stub router; production passes the
 * real, credentialled `pillar('ai')`, built fresh per call so a missing key
 * degrades the client instead of failing boot.
 */
export function createAiClient(
  handleFactory: () => PillarHandle<AiRouter> | null = () =>
    credentialled(AI_PILLAR_ID, () => pillar<AiRouter>('ai', { callTimeoutMs: SUGGEST_TIMEOUT_MS }))
): AiClient {
  return {
    async suggestCodes(context, count) {
      const handle = handleFactory();
      if (handle === null) return undefined;
      let result;
      try {
        result = await handle.codes.suggest(toRequest(context, count));
      } catch {
        return undefined;
      }
      if (!isOk(result)) {
        if (result.kind === UNAUTHORIZED_REASON) {
          console.error(credentialRejectedMessage(AI_PILLAR_ID, 'codes.suggest'));
        }
        return undefined;
      }
      return result.value.data.suggestions.map((suggestion) => suggestion.code);
    },
  };
}
