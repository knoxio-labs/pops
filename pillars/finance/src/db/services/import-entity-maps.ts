/**
 * The in-memory lookups an import run builds once from the contacts pillar.
 *
 * Split out of `imports.ts` (POPS-3068). Everything here is pure: no database
 * access at all, which is what separates it from the rest of that file. The
 * imports slice mirrors no entity table, so the matcher fetches the contact set
 * live per run and these turn it into the maps the matching stages index into.
 *
 * Re-exported through `imports.ts` so `importsService.*` still names all of it.
 */
import type { ContactEntity } from '../../api/contacts/client.js';

/** Single entry in the entity name lookup map. */
export interface EntityLookupEntry {
  id: string;
  /** Original-case entity name as stored in the contacts pillar. */
  name: string;
  /**
   * Contact entity type (e.g. `company`, `person`, `government`) — used to keep
   * personal-name PII out of AI prompts. Optional because only the live
   * `buildEntityMaps` path (which always sets it) needs it; local matcher
   * fixtures may omit it.
   */
  type?: string;
}

/** Two pre-built maps consumed by the import matching stages. */
export interface EntityMaps {
  /** Lowercase entity name → `{ id, name (original case) }`. */
  entityLookup: Map<string, EntityLookupEntry>;
  /** Lowercase alias → entity name (original case). */
  aliasMap: Map<string, string>;
}

/**
 * Build the entity lookup + alias maps consumed by the import matching
 * stages from a contact set fetched live from the contacts pillar. Pure —
 * no DB access; the caller fetches the set once per import run and feeds it
 * here, so the maps reflect the live contacts data with no persistent mirror.
 *
 * - Lookup keys are lowercased for O(1) case-insensitive lookups.
 * - Values preserve the original-case name for display.
 * - Aliases arrive already split into arrays from the contacts wire shape;
 *   whitespace-only aliases are dropped.
 */
export function buildEntityMaps(contacts: ContactEntity[]): EntityMaps {
  const entityLookup = new Map<string, EntityLookupEntry>();
  const aliasMap = new Map<string, string>();

  for (const contact of contacts) {
    entityLookup.set(contact.name.toLowerCase(), {
      id: contact.id,
      name: contact.name,
      type: contact.type,
    });
    for (const raw of contact.aliases) {
      const alias = raw.trim();
      if (alias.length === 0) continue;
      aliasMap.set(alias.toLowerCase(), contact.name);
    }
  }

  return { entityLookup, aliasMap };
}

/**
 * Build the `entityId → defaultTags` map the tag-suggester's entity-default
 * stage consumes, from the same fetched contact set. Pure — one in-memory map
 * per import run, no per-transaction DB read.
 */
export function buildDefaultTagsByEntity(contacts: ContactEntity[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const contact of contacts) {
    if (contact.defaultTags.length > 0) map.set(contact.id, contact.defaultTags);
  }
  return map;
}
