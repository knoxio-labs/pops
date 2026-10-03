# ADR-056: A tags pillar owns the shared vocabulary; each pillar owns its own assignments

## Status

Accepted — 2026-10-02. Work is tracked under POPS-5382.

## Context

Three pillars tag things and none of them agree. Finance stores `facet:value` strings in a JSON array on the transaction and validates some facets against its own `tag_vocabulary`. Purchases stores flat slugs per line item and derives its vocabulary by counting. Food and cerebrum each keep free-text tag tables. Inventory has none.

Most of those tags have no reason to agree. Finance's `venue`, `fee` and `channel` describe a payment and mean nothing on a recipe. A few do cross pillars, and they are the ones a question like "what did the Japan trip cost, and what did I bring back" depends on: a trip, a hobby, a project. Finance already holds `trip:` and `hobby:` values typed by hand, which is a name standing in for a thing that has an identity elsewhere. Entity names drifted the same way until `entity_id` became the operative field.

ADR-042's 2026-08-12 amendment kept purchases' item tags and finance's vocabulary apart and said a roll-up between them "would need a mapping". With a third and fourth pillar that is a mapping per pair.

Options considered:

| Option                                                       | Why not                                                                                                                                            |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-pillar vocabularies with mappings between them           | One mapping per pair of pillars, each maintained by hand                                                                                           |
| A central pillar holding the vocabulary and every assignment | Every tag write crosses the network, and a pillar that sums by tag needs a second copy to stay fast; two copies need an event system to stay equal |
| A central vocabulary, assignments in each pillar             | Chosen                                                                                                                                             |

## Decision

**A `tags` pillar owns the shared vocabulary and its structure. It holds no assignments.**

A tag has an id, a facet, a name, an optional parent, a description, an optional window (a date range and an optional region), an archived flag and a merged-into pointer. The id is the identity; the name is a label that can change. Hierarchy is the parent pointer, never segments in a string. Tags are archived, never deleted, and a merge leaves a pointer that readers follow, so no pillar has to be told.

**A participating pillar promises two things and nothing else:**

1. A shared tag id can be attached to and detached from its own things.
2. It can answer which of its own things carry any of a given list of tag ids.

Storage, proposing, confirming, deriving and review belong to the pillar. No shared code specifies them.

The promise is a wire convention, declared once. A participating pillar adds a `tags` block to its manifest naming the kinds of thing it tags, and serves three operations with fixed ids: `tagged.list` (`POST /tagged/query`), `tagged.attach` (`PUT /tagged/:entityType/:entityId/tags/:tagId`) and `tagged.detach` (`DELETE` on the same path). This is unrelated to `supportsTags` on a search adapter, which says only that the adapter's `/search` honours a tag filter.

Pillars cache the vocabulary and reference tags by id, without a foreign key, the posture `merchant_entity_id` already takes (ADR-053). A caller expands a tag before asking, so a pillar only ever matches a list of ids. Expanding returns the tag, its descendants, and every tag merged into any of them.

**Anyone may create a tag**: the owner, a pillar, or an AI caller. The tags pillar adds no rule about who may create beyond the fleet's ordinary service-account scopes (ADR-044). A pillar may restrict its own callers. A name is unique within its facet among tags that are not archived, ignoring case, and creating a name that exists returns the existing tag.

**A facet is shared when a second pillar would assign it or be asked about it.** The first shared facets are `trip`, `hobby` and `project`. A pillar's private facets stay in that pillar.

## Consequences

- "Everything carrying this tag" is a fan-out across participating pillars, not one lookup. It lives in `pillars/orchestrator`, which already federates search and owns no database, and it reports which pillars answered so a missing one is visible. A central index can be added later as a cache without moving the truth.
- The MCP gateway may attach and detach a shared tag on a finance transaction or a purchase item. Those two tool families stay read-only otherwise.
- A trip's membership lives on the rows in each pillar. A trips pillar sits on top of the tag: it owns bookings and places and points each trip at its tag. That overturns the link-set position recorded in POPS-3565.
- ADR-042's separation of the two vocabularies still holds for purchases' own item descriptors. What changes is that a purchase item and a transaction can now carry the same shared tag with no mapping.
- A window on a tag lets a pillar propose membership from a row's date and place. Whether and how a pillar does that is its own decision.
- The tags pillar being down blocks creating a tag and nothing else, because pillars validate against their cached copy.
- Whether `contains`, `asset` and `person` become shared facets is undecided and waits for use (POPS-5382).

## Cross-references

- ADR-026 (pillar architecture): each pillar owns its own database and consumes others only through a published contract.
- ADR-042 (purchase documents and transaction reconciliation): the amendment this decision narrows.
- ADR-053 (merchant addresses owned by contacts): the precedent for referencing another pillar's record by id with no foreign key.
