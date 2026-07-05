/**
 * Bounded, deterministic known-entity vocabulary passed to the AI categorizer
 * as a closed-set hint (CF062/#3661) — grounds the model's merchant-name
 * guess in the system's own entity list instead of a fully zero-shot guess,
 * so a differently-cased/phrased reply has a chance to resolve against an
 * existing entity. Capped by count and total characters to protect the
 * per-row token budget: categorization calls are uncached, one per unmatched
 * row.
 */
import type { EntityLookupMap } from './entity-matcher.js';

const MAX_KNOWN_ENTITIES = 60;
const MAX_KNOWN_ENTITIES_CHARS = 1000;

export function buildKnownEntityHint(entityLookup: EntityLookupMap): string[] {
  const names = [...new Set([...entityLookup.values()].map((entry) => entry.name))].toSorted(
    (a, b) => a.localeCompare(b)
  );

  const bounded: string[] = [];
  let chars = 0;
  for (const name of names) {
    if (bounded.length >= MAX_KNOWN_ENTITIES) break;
    const addedChars = name.length + 2; // account for the ", " separator
    if (chars + addedChars > MAX_KNOWN_ENTITIES_CHARS) break;
    bounded.push(name);
    chars += addedChars;
  }
  return bounded;
}
