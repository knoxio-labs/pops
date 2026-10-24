# ADR-057: Contact sources retain their identity through imports and reversible person merges

## Status

Proposed — 2026-10-24. Contract work is tracked under POPS-6045, within POPS-3566.

This proposal does not approve an interface design. Person editing, import preview and duplicate review require a separate recorded choice in the design playground before their chosen interfaces are implemented.

## Context

Contacts owns the entities that finance and purchases reference by UUID. Its existing name constraint folds Unicode case and diacritics, making a merchant create-or-fetch retry resolve to the same entity. People can share names, including a name already used by a merchant. Extending that constraint to imported people would silently equate homonyms; removing it entirely would break merchant creation.

An imported record is also not a person. The same person can have several records across accounts and providers, while one shared email or phone can describe several people. Re-import must recognize its own records without treating names as provider identifiers or replacing local decisions. Merging must preserve references held in databases that contacts cannot update transactionally.

Options considered:

| Option                                                             | Tradeoff                                                                                                         |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| A separate people store with new IDs                               | Creates two identities for counterparties already referenced by the fleet and requires a second lookup contract. |
| Globally unique person names, emails or phones                     | Cannot represent homonyms or shared contact points; turns incomplete evidence into a storage constraint.         |
| Destructive merges followed by rewriting every consumer            | Requires a distributed transaction and loses the original ownership needed for reversal.                         |
| Extend entities, retain source observations and resolve merged IDs | Chosen; reads and comparisons must explicitly account for canonical identity.                                    |

## Proposed decision

### Entities remain the fleet identity

`entities.id` remains the stable UUID. A person extends `type = person` through child records for structured names and labeled email, phone and social contact points. Existing entity fields and IDs remain available. `entities.name` remains a display name, not proof of a complete person name.

Replace the global unique-name index with a partial unique index on `name COLLATE UNICODE_NOCASE` for non-person entities. Non-person uniqueness continues across the existing non-person types. Person/person and person/non-person name collisions are permitted. Create, rename and type-change checks use the effective new type and agree with the database constraint. Existing merchants retain the current Unicode identity rule.

Generic entity listing and explicit-ID reads continue to include people: finance already uses people as counterparties. Name resolution must declare its purpose. Merchant create-or-fetch searches the non-person namespace, including its existing alias rules. A person lookup never selects the first homonym or creates a person as a fallback for unresolved ambiguity. Contacts exposes candidate ambiguity rather than disguising it as not found.

The current finance `fetchByExactName` helper selects the first result, and both fetches in `createOrFetchByName(name, type)` use it without the requested type. Those calls must use the declared namespace and an ambiguity-aware result before person name collisions are enabled. Purchases' merchant resolver must request the merchant namespace while retaining its existing refusal to choose between equally qualifying candidates. Generic counterparty reads are unaffected by that scope.

### Sources own observations, not canonical people

A source account has an internal UUID, a provider discriminator, a stable provider account subject where available, a mutable display label and connection metadata. A source record is unique by account, collection and provider record key; the account fixes the provider. Resource URLs and ETags are transport metadata, not substitutes for stable identity when a provider supplies one. Record keys are never global across accounts or address books.

Imported names and contact points retain their original values, labels, source record, observation revision and active status. Matching keys are stored separately and may be absent. Structured names retain given, additional, family, prefix and suffix components; a display-only name carries unknown completeness. Multiple records may provide the same value, and multiple people may share it. Email and phone matching keys therefore have ordinary indexes, never global unique constraints.

Local edits have an explicit local origin. Preferred values select retained observations; they are not a provider priority order. A source update replaces only that record's active observations. A selected value withdrawn by its source remains retained and visibly stale until the operator selects or edits it. Removing a record or disconnecting an account does not delete a person, erase local edits, or cascade through other sources. Disconnect stops fetching and revokes or removes its credential; removing retained imported observations is a separate explicit operation.

### File and API inputs use one staged import contract

Parsers and provider adapters produce typed source records with original values and optional structured names. They do not write entities or decide identity. A parser's row/card ordinal is batch-local; its optional vCard UID is a separate field. Provider adapters add account, collection and record identity before staging.

An exported stable UID is used within the selected source account and collection. Files without stable record IDs use the exact uploaded file digest plus row/card ordinal for replay identity. Repeating that same file is idempotent. A changed file cannot acquire a universal stable record ID from a name, email or row position; uncertain continuity requires review. Two divergent observations claiming the same stable source key within one batch block that key until resolved.

Staging persists valid records, row errors, recognized source bindings and proposed actions without mutating the directory. Preview exposes invalid, new, recognized and uncertain records separately. Commit specifies the selected valid rows, their decisions, the expected batch revision and an idempotency key. It applies that selection and its audit record in one SQLite transaction. Invalid or deferred rows remain visible; they are never silently dropped. A stale preview conflicts rather than applying decisions to changed evidence. Repeating an identical committed request returns its recorded result; reusing its key with another body conflicts.

Recognized source records update their existing member identity before any duplicate classification. Re-import cannot move them to a different person merely because another matching value appears. All imports preserve local selections and prior keep-separate decisions.

API pages use the same staging operation. An account/collection checkpoint advances only with the durable page it describes. A terminal incremental token becomes current only after the complete run is durable. Interrupted or rejected full scans cannot infer source deletions from missing records. Rate limits, authentication failures and parse failures are explicit outcomes, not empty successful scans.

### Matching is conservative and independent of storage

The classifier consumes source evidence, candidate identities and persisted decisions. Its result distinguishes recognized source, new person, eligible automatic match and review with reasons and candidate IDs. It never merges a transitive connected component merely because each edge shares some identifier.

Exact email equality, a phone normalized to E.164 using explicit country context, or exact complete full-name equality may qualify automatically. Qualification requires one unambiguous target across the directory and the staged batch, no known shared identifier, no contradictory evidence and no keep-separate decision between any affected members. Multiple matching targets or competing evidence require review. An explicit human choice can merge records that automatic classification declines.

Email normalization trims surrounding whitespace, preserves local-part case and lowercases the ASCII domain; it does not remove plus tags or provider-specific dots. Different local-part case remains ineligible for an automatic equality match. Phone matching requires a valid international number or an explicit region sufficient to parse a national number; digit stripping alone is insufficient. Missing region or invalid input leaves a phone ineligible, while retaining its original value.

Complete-name evidence comes from structured given and family components or an explicit human confirmation that the recorded multi-component name is complete. A display string's token count does not establish completeness. First-name-only records never qualify, including when somebody labels the field complete. Complete-name comparison retains accents and component boundaries and performs only Unicode normalization, case normalization and whitespace normalization. The merchant diacritic-folding collation is not a person matching rule. Approximate names and unverified social handles never trigger automatic merges.

Keep-separate stores unordered stable member pairs, not only current canonical roots. It survives import replay and subsequent grouping. A proposed merge checks every resulting cross-group pair so an indirect merge cannot bypass that decision. Later records remain undecided rather than inheriting permission from the absence of a pair decision.

### Merges preserve members and resolve canonical IDs

A merge retains the member entity rows and their source bindings. An acyclic membership/redirect relation selects one existing entity UUID as canonical; an immutable operation records its members, evidence, selected values and before/after revisions. Only person/person merges belong to this contract. Mixed-type merges fail explicitly.

The merged person is a projection over retained members. Addresses keep their existing IDs and original member ownership; reads expose the group's addresses without copying them. Avatar and poster choices reference retained blobs, and losing selections are not garbage-collected while needed for undo. Deleting a merged member or canonical root through ordinary entity deletion is refused.

Reads by a retired member ID return the current canonical entity and its canonical ID. List and search return each canonical identity once. Bulk resolution returns a mapping for every requested ID, including several IDs resolving to one canonical ID, and distinguishes missing IDs. Ordinary writes addressed to a retired ID return a conflict naming its canonical ID so stale clients cannot edit the wrong scope silently. Merge operations require explicit member IDs, expected group revisions and an idempotency key, and atomically reject cycles, stale evidence and incompatible decisions.

Finance and purchases keep their historical stored IDs. Before equality comparisons, aggregation or joining, they resolve those IDs through the mapping contract; a display-only read redirect does not make an aggregation correct. An address/entity ownership check compares resolved owner IDs while retaining the original address identity. Contacts unavailability leaves resolution unavailable rather than treating historical IDs as deleted or automatically distinct. No cross-pillar reference rewrite is part of a merge.

Undo restores the retained member identities, selections and source associations only for the latest applicable merge whose post-merge revisions and dependent ownership still match. A later edit, import mutation, dependent address/asset mutation or merge affecting that group blocks automatic undo with a conflict and the changed evidence. It never overwrites unrelated later work. Undo itself is atomic and idempotent. Manual correction is possible after a conflict, but is a new explicit decision rather than a best-effort rollback.

References created in another pillar after the merge remain references to the chosen canonical UUID after undo. Contacts cannot reconstruct which former member the operator intended, because the external write recorded only that UUID. The undo contract states this limit; it does not promise to reverse distributed history.

### Provider credentials and management have separate authorization

Production bootstrap secrets and the encryption root key arrive through mounted Docker secret files; local development may resolve an environment fallback. Credential values are never logged, included in error messages or serialized into account responses. Rust credential wrappers have no plaintext `Debug` or `Serialize` implementation. Account metadata exposes an opaque credential reference and connection status, never a recoverable secret.

Per-account refresh tokens and CardDAV app credentials are encrypted before storage in contacts SQLite using authenticated encryption, fresh nonces and a versioned envelope with account identity bound as associated data. The root key is stored outside that database and its backups. A configured but unavailable encryption key fails closed; it never falls back to plaintext storage. Key rotation retains the ability to read existing envelopes until they have been re-encrypted. The unused `pops-settings` crate is not a credential vault.

Connection, disconnect and credential replacement require a verified operator human principal. The absence of `X-API-Key` does not prove that principal: the current contacts scope middleware passes uncredentialled requests through to the perimeter. Provider management therefore needs an explicit verified Access identity and operator policy rather than assuming every perimeter caller is human. Provider callbacks bind expiring, single-use state to that operator and account. Credentials have no public read/export operation.

Service accounts may stage or synchronize only through expressly granted contacts scopes; those grants do not confer connection or credential administration. Scheduled internal work runs against an already authorized connection. Provider transport is read-only and uses fixed or validated provider discovery origins, bounded responses and redirect policy so credentials cannot be forwarded to arbitrary URLs.

## Consequences

The source and person foundation can ship without enabling automatic matching. File parsing can ship as a pure adapter against that foundation; provider adapters use the same boundary. Canonical resolution and its finance/purchases consumers must ship before merged identities are exposed. Backend contracts and migrations do not select a UI design.

Person CRUD, source observations, import transactions, pure matching, merge transactions and each provider adapter are separate Rust modules. A single integration owner updates shared router wiring, migrations, OpenAPI and affected generated consumers. Public interfaces document their identity, revision and error contracts. This avoids several workers independently inventing incompatible copies of those contracts.

Retaining members and observations costs storage and makes ordinary deletion more restrictive. It provides provenance and bounded reversal without a distributed write protocol. Ambiguity remains visible work for the operator; a slower manual decision is preferable to recording a confident identity the evidence does not support.

## Cross-references

- [ADR-033](adr-033-cross-language-pillar-contracts.md): contacts OpenAPI and generated consumers move together when the published contract changes.
- [ADR-040](adr-040-cross-pillar-contract-discipline.md): consumers use published contracts rather than importing contacts internals.
- [ADR-044](adr-044-inbound-service-account-scope-enforcement.md): explicit service-account grants remain distinct from human identity.
- [ADR-053](adr-053-merchant-addresses-owned-by-contacts.md): contacts owns address identity referenced by purchases.
- [ADR-054](adr-054-error-envelope-and-codes.md): conflicts and provider failures use the common error envelope.
