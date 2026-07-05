/**
 * 5-stage entity matching pipeline (pure, no DB).
 *
 *   1. Manual aliases — alias substring → entity name (min 4 chars, longest wins)
 *   2. Exact match — case-insensitive against the entity lookup
 *   3. Prefix match — description starts with entity name (longest wins)
 *   4. Contains match — entity name anywhere in description (min 4 chars, longest wins)
 *   5. Punctuation stripping — treat hyphens as a space, drop apostrophes/
 *      ampersands/periods, retry stages 2-4
 *
 * Diacritics (accents, e.g. "café" → "cafe") are folded unconditionally on
 * every stage, not just the stage-5 retry — an accented merchant should
 * exact-match a plain-ASCII entity name on the first pass (CF056/CP022:
 * `normalizeDescription` in `contract/corrections-pure.ts` and
 * `db/services/transaction-corrections-types.ts` fold diacritics the same
 * way and must stay in lockstep with this).
 *
 * The AI fallback (stage 6) is handled by the caller. Copied verbatim from the
 * monolith `lib/entity-matcher.ts`, with the alias stage (CF023) given the
 * same specificity guards as contains/prefix: a short/generic alias (under
 * `MIN_ALIAS_LENGTH` chars) is skipped rather than allowed to hijack a better
 * match, and when several aliases match the same description the longest
 * (most specific) alias key wins instead of whichever came first in Map
 * iteration order.
 */
import type { EntityLookupEntry } from '../../../db/index.js';

export type EntityLookupMap = Map<string, EntityLookupEntry>;
export type AliasMap = Map<string, string>;

const MIN_ALIAS_LENGTH = 4;

export interface EntityMatch {
  entityName: string;
  entityId: string;
  matchType: 'alias' | 'exact' | 'prefix' | 'contains';
}

/** Strip combining diacritical marks left behind by an NFKD decomposition (e.g. "é" → "e"). */
function foldDiacritics(value: string): string {
  return value.normalize('NFKD').replaceAll(/[\u0300-\u036f]/g, '');
}

/**
 * Broaden the punctuation-retry stage: a hyphen is a word separator like a
 * space ("WW-METRO" ~ "WW METRO"), so it's replaced rather than dropped;
 * apostrophes/ampersands/periods carry no separating meaning, so they're
 * simply removed ("M&S" → "MS", "J.Crew" → "JCREW").
 */
function stripPunctuationForRetry(value: string): string {
  return value.replaceAll(/-/g, ' ').replaceAll(/['`&.]/g, '');
}

function normalizeKey(key: string, stripPunctuation: boolean): string {
  const folded = foldDiacritics(key);
  const stripped = stripPunctuation ? stripPunctuationForRetry(folded) : folded;
  return stripped.toUpperCase();
}

function findExactMatch(
  normalized: string,
  entries: [string, EntityLookupEntry][],
  stripPunctuation: boolean
): EntityMatch | null {
  for (const [key, entry] of entries) {
    if (normalized === normalizeKey(key, stripPunctuation)) {
      return { entityName: entry.name, entityId: entry.id, matchType: 'exact' };
    }
  }
  return null;
}

function findPrefixMatch(
  normalized: string,
  entries: [string, EntityLookupEntry][],
  stripPunctuation: boolean
): EntityMatch | null {
  let best: EntityMatch | null = null;
  for (const [key, entry] of entries) {
    const upper = normalizeKey(key, stripPunctuation);
    if (!normalized.startsWith(upper)) continue;
    if (!best || entry.name.length > best.entityName.length) {
      best = { entityName: entry.name, entityId: entry.id, matchType: 'prefix' };
    }
  }
  return best;
}

function findContainsMatch(
  normalized: string,
  entries: [string, EntityLookupEntry][],
  stripPunctuation: boolean
): EntityMatch | null {
  let best: EntityMatch | null = null;
  for (const [key, entry] of entries) {
    if (key.length < 4) continue;
    const upper = normalizeKey(key, stripPunctuation);
    if (!normalized.includes(upper)) continue;
    if (!best || entry.name.length > best.entityName.length) {
      best = { entityName: entry.name, entityId: entry.id, matchType: 'contains' };
    }
  }
  return best;
}

function tryMatch(
  normalized: string,
  entityLookup: EntityLookupMap,
  stripPunctuation = false
): EntityMatch | null {
  const entries = [...entityLookup.entries()];
  return (
    findExactMatch(normalized, entries, stripPunctuation) ??
    findPrefixMatch(normalized, entries, stripPunctuation) ??
    findContainsMatch(normalized, entries, stripPunctuation)
  );
}

function findByName(entityName: string, lookup: EntityLookupMap): EntityLookupEntry | undefined {
  return lookup.get(entityName.toLowerCase());
}

function findAliasMatch(
  normalized: string,
  aliases: AliasMap,
  entityLookup: EntityLookupMap
): EntityMatch | null {
  let best: (EntityMatch & { keyLength: number }) | null = null;
  for (const [key, entityName] of aliases) {
    if (key.length < MIN_ALIAS_LENGTH) continue;
    const upperKey = key.toUpperCase();
    if (!normalized.includes(upperKey)) continue;
    const entry = findByName(entityName, entityLookup);
    if (!entry) continue;
    if (!best || upperKey.length > best.keyLength) {
      best = {
        entityName: entry.name,
        entityId: entry.id,
        matchType: 'alias',
        keyLength: upperKey.length,
      };
    }
  }
  if (!best) return null;
  const { entityName, entityId, matchType } = best;
  return { entityName, entityId, matchType };
}

/** Match a transaction description to an entity, or null if no stage hits. */
export function matchEntity(
  description: string,
  entityLookup: EntityLookupMap,
  aliases: AliasMap
): EntityMatch | null {
  const normalized = foldDiacritics(description).toUpperCase().trim();

  const aliasMatch = findAliasMatch(normalized, aliases, entityLookup);
  if (aliasMatch) return aliasMatch;

  const result = tryMatch(normalized, entityLookup);
  if (result) return result;

  const stripped = stripPunctuationForRetry(normalized);
  return tryMatch(stripped, entityLookup, true);
}
