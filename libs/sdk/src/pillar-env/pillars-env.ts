/**
 * `POPS_PILLARS` environment-variable parser.
 *
 * Format: `id:baseUrl[,id:baseUrl,...]`
 *   - `id` lowercase kebab-case pillar slug (`food`, `finance`, …)
 *   - `baseUrl` fully-qualified http(s) origin (trailing slashes stripped)
 *   - whitespace around `:` and `,` tolerated
 *
 * Strict: malformed input throws rather than silently dropping entries,
 * because a dropped entry surfaces later as an unexplained "pillar
 * unavailable" with no clue where it went.
 */

import { BareOriginParseError, parseBareOrigin } from './bare-origin.js';

import type { PillarRegistryEntry } from '@pops/types';

const PILLAR_ID_RE = /^[a-z0-9-]+$/;

export interface ParsePillarsEnvOptions {
  /**
   * When true (default), empty / undefined input returns an empty registry.
   * When false, empty input throws — useful for deploys that require the
   * variable to be set explicitly.
   */
  readonly allowEmpty?: boolean;
}

export class PillarsEnvParseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`POPS_PILLARS: ${message}`, options);
    this.name = 'PillarsEnvParseError';
  }
}

export function parsePillarsEnv(
  raw: string | undefined,
  options: ParsePillarsEnvOptions = {}
): readonly PillarRegistryEntry[] {
  const { allowEmpty = true } = options;
  const trimmed = (raw ?? '').trim();

  if (trimmed.length === 0) {
    if (allowEmpty) return [];
    throw new PillarsEnvParseError('value is empty');
  }

  const entries: PillarRegistryEntry[] = [];
  const seenIds = new Set<string>();

  for (const rawPair of trimmed.split(',')) {
    const entry = parsePillarEntry(rawPair, seenIds);
    seenIds.add(entry.id);
    entries.push(entry);
  }

  return entries;
}

function parsePillarEntry(rawPair: string, seenIds: ReadonlySet<string>): PillarRegistryEntry {
  const pair = rawPair.trim();
  if (pair.length === 0) {
    throw new PillarsEnvParseError('empty entry between commas — remove the stray comma or value');
  }
  const colon = pair.indexOf(':');
  if (colon === -1) {
    throw new PillarsEnvParseError(`entry "${pair}" is missing a colon — expected id:baseUrl`);
  }
  const id = pair.slice(0, colon).trim();
  const baseUrlRaw = pair.slice(colon + 1).trim();
  if (id.length === 0) {
    throw new PillarsEnvParseError(`entry "${pair}" is missing the id half`);
  }
  if (!PILLAR_ID_RE.test(id)) {
    throw new PillarsEnvParseError(`id "${id}" is not lowercase kebab-case ([a-z0-9-]+)`);
  }
  if (seenIds.has(id)) {
    throw new PillarsEnvParseError(`duplicate pillar id "${id}"`);
  }
  if (baseUrlRaw.length === 0) {
    throw new PillarsEnvParseError(`entry "${pair}" is missing the baseUrl half`);
  }
  return { id, baseUrl: parseEntryBaseUrl(id, baseUrlRaw) };
}

/**
 * Restate a bare-origin rejection as a `POPS_PILLARS` failure. The origin rule
 * is shared with the self-base-url surfaces, whose errors must NOT claim the
 * variable at fault is `POPS_PILLARS` — so the prefix is added here, at the
 * one call site where it is true, rather than inside `parseBareOrigin`.
 */
function parseEntryBaseUrl(id: string, raw: string): string {
  try {
    return parseBareOrigin(`pillar '${id}' baseUrl`, raw);
  } catch (err) {
    if (err instanceof BareOriginParseError) {
      throw new PillarsEnvParseError(err.message, { cause: err });
    }
    throw err;
  }
}
