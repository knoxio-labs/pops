/**
 * Naming the merchant a receipt came from.
 *
 * The drop-zone reads a trading name off a photograph — `Bunnings
 * Warehouse`, `Carrefour Market` — and contacts owns the entities the rest
 * of the fleet reconciles against. Joining them makes a photographed
 * receipt land under the same merchant as the card transaction that paid
 * for it.
 *
 * **The bar is deliberately high, because `merchantEntityId` is operative
 * data.** A wrong entity silently attributes someone else's spending, and
 * that is very hard to notice afterwards — the purchase looks perfectly
 * ordinary, just filed under the wrong name. `merchantEntityName` carries
 * the receipt's own wording regardless, so declining to match costs a link
 * rather than the information.
 *
 * Unknown is therefore a valid outcome and not a failure, exactly as
 * POPS-240 asks: the escape hatch exists for merchants nothing recognises.
 */
import { isOk, type CallResult, type PillarHandle } from '@pops/pillar-sdk/server';

import {
  credentialledPillar,
  credentialRejectedMessage,
  UNAUTHORIZED_REASON,
} from '../pillars/outbound.js';
import { EntityListResponseSchema, type ContactEntity } from './wire.js';

export const CONTACTS_PILLAR_ID = 'contacts';

/**
 * Contacts searches names with a substring LIKE in one direction only, so
 * asking for `Bunnings Warehouse` never finds an entity called `Bunnings`.
 * The search is therefore seeded with the leading word and the candidates
 * are compared here, where both strings are in hand.
 */
const CANDIDATE_LIMIT = 50;

/** Words that identify nothing on their own. */
const NOISE = new Set([
  'the',
  'a',
  'pty',
  'ltd',
  'limited',
  'inc',
  'llc',
  'gmbh',
  'sarl',
  'bv',
  'nv',
  'co',
  'company',
  'store',
  'shop',
  'market',
  'supermarket',
  'warehouse',
]);

/**
 * Fold a name to something comparable across a receipt and a contact list.
 *
 * Diacritics go because a receipt prints `CARREFOUR` where the entity says
 * `Carrefour`, and punctuation goes because one of them writes `Bunnings`
 * and the other `Bunnings.`. Nothing else is touched — this is not a fuzzy
 * matcher and must not become one.
 */
export function foldName(name: string): string {
  return name
    .normalize('NFD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replaceAll(/[^\p{L}\p{N}\s]/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim();
}

/** The most identifying word, used to seed the producer's substring search. */
export function searchSeed(name: string): string | null {
  const words = foldName(name)
    .split(' ')
    .filter((word) => word.length >= 3 && !NOISE.has(word.toLowerCase()));
  return words[0] ?? null;
}

/**
 * Decide whether a candidate is the merchant, given the receipt's wording.
 *
 * Accepts equality, and accepts a candidate whose whole folded name is the
 * leading run of words of the receipt's — `Bunnings` matches `Bunnings
 * Warehouse`, because a shop's trading name commonly carries a suffix its
 * entity does not.
 *
 * It does NOT accept the reverse. A receipt saying `Coles` must not match
 * an entity called `Coles Express`, which is a petrol station and a
 * different business.
 */
export function isSameMerchant(receiptName: string, candidateName: string): boolean {
  const receipt = foldName(receiptName);
  const candidate = foldName(candidateName);
  if (receipt === '' || candidate === '') return false;
  if (receipt === candidate) return true;
  return receipt.startsWith(`${candidate} `);
}

/**
 * The subset of the contacts router this pillar calls. The SDK proxy wraps
 * the return in a {@link CallResult}, so the declaration states the
 * producer's own signature rather than the wrapped one.
 */
export type ContactsRouter = {
  entities: {
    list: (input: { search?: string; limit?: number }) => Promise<unknown>;
  };
};

export interface MerchantResolver {
  /** The entity id, or null when nothing matched unambiguously. */
  resolve(receiptMerchantName: string): Promise<string | null>;
}

/**
 * Pick the one candidate that is the merchant, or none.
 *
 * Two candidates that both qualify is not a near-miss to be broken by
 * ranking — it is the case where guessing costs most, because the two
 * entities are by construction similarly named and a human would have to
 * look. Ambiguity resolves to no match.
 */
export function chooseMerchant(
  receiptName: string,
  candidates: readonly ContactEntity[]
): string | null {
  const matches = candidates.filter((entity) => isSameMerchant(receiptName, entity.name));
  if (matches.length !== 1) return null;
  return matches[0]?.id ?? null;
}

/**
 * Live resolver over the contacts pillar.
 *
 * Every failure answers null. A contacts pillar that is down, slow or
 * unregistered must not stop a receipt being read — the purchase is still
 * real, and the merchant name off the paper is still recorded.
 *
 * A *refused credential* answers null too, and is the one failure that says
 * so out loud: it does not clear on its own, and silently unresolved
 * merchants are indistinguishable from merchants contacts genuinely does not
 * know — which is a valid outcome here and therefore no signal at all.
 *
 * The handle is resolved per call rather than at construction. This resolver
 * is built while the Express app is assembled, and `pillar()` from
 * `@pops/pillar-sdk/server` refuses to build a handle without a
 * service-account key: constructing eagerly would turn a missing key into a
 * pillar that will not boot.
 */
export function createMerchantResolver(handle?: PillarHandle<ContactsRouter>): MerchantResolver {
  return {
    async resolve(receiptMerchantName: string): Promise<string | null> {
      const seed = searchSeed(receiptMerchantName);
      if (seed === null) return null;

      const contacts = handle ?? credentialledPillar<ContactsRouter>(CONTACTS_PILLAR_ID);
      if (contacts === null) return null;

      let result: CallResult<unknown>;
      try {
        result = await contacts.entities.list({ search: seed, limit: CANDIDATE_LIMIT });
      } catch {
        return null;
      }
      if (!isOk(result)) {
        if (result.kind === UNAUTHORIZED_REASON) {
          console.error(credentialRejectedMessage(CONTACTS_PILLAR_ID, 'entities.list'));
        }
        return null;
      }

      const parsed = EntityListResponseSchema.safeParse(result.value);
      if (!parsed.success) return null;

      return chooseMerchant(receiptMerchantName, parsed.data.data);
    },
  };
}
