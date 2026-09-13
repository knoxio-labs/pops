/**
 * Refusals raised at the tag-rule write boundary (POPS-3666, POPS-3664).
 *
 * Split out of `errors.ts`, which is re-exported from here, so that file stays
 * under its line cap.
 */

/**
 * A tag-rule write carrying a tag on a `marker` facet (`flag:`, `person:`).
 *
 * A marker is written from provenance onto one row. Baked into a rule it
 * becomes a standing property of the merchant: every future match is stamped
 * with it, and a `flag:needs-review` rule permanently excludes that merchant
 * from the tag-coverage gate (POPS-2683).
 */
export class MarkerFacetTagRuleError extends Error {
  override readonly name = 'MarkerFacetTagRuleError' as const;
  /** The offending tags, in the order they were given. */
  readonly tags: readonly string[];

  constructor(tags: readonly string[]) {
    super(
      `A tag rule may not carry a marker tag: ${tags.join(', ')}. ` +
        'Marker facets are written from provenance onto a single transaction, never by a rule'
    );
    this.tags = tags;
  }
}

/**
 * A tag-rule write scoped to an unresolved `temp:` placeholder entity id.
 *
 * No contact ever carries such an id, so the rule could never fire and would
 * sit in the table as a dead duplicate of the rule on the real entity.
 */
export class PlaceholderEntityScopeError extends Error {
  override readonly name = 'PlaceholderEntityScopeError' as const;
  readonly entityId: string;

  constructor(entityId: string) {
    super(`Refusing to scope a tag rule to unresolved placeholder entity id '${entityId}'`);
    this.entityId = entityId;
  }
}
