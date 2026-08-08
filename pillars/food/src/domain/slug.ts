import { InvalidSlugError } from '../db/errors.js';

/**
 * Canonical slug grammar for the food domain: lowercase ASCII kebab-case,
 * matching `[a-z0-9]+(-[a-z0-9]+)*`. Empty strings, leading/trailing
 * hyphens, double hyphens, uppercase, and any non-ASCII are rejected.
 *
 * The slug is the ingredient's identity across the DSL, the URL and the
 * import path (ADR-022), so the grammar has to be the intersection of what
 * all three accept — hence ASCII-only and no separator run that could
 * round-trip differently.
 */
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

/** Throw `InvalidSlugError` if the slug doesn't match the canonical grammar. */
export function assertValidSlug(slug: string): void {
  if (typeof slug !== 'string' || slug.length === 0) {
    throw new InvalidSlugError(String(slug), 'must be a non-empty string');
  }
  if (!SLUG_RE.test(slug)) {
    throw new InvalidSlugError(slug, 'must be lowercase kebab-case [a-z0-9]+(-[a-z0-9]+)*');
  }
}
