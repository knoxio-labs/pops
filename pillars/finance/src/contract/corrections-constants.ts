/**
 * Confidence-floor constant shared by both the correction-rule pure helpers
 * (`corrections-pure.ts`) and the REST zod schemas (`rest-corrections-schemas.ts`
 * et al). Split into its own dependency-free module so the schemas can import
 * it without creating a cycle back through `corrections-pure.ts` (which itself
 * imports the `ChangeSet`/`ChangeSetOp` types from the schemas module).
 */

/**
 * Confidence floor below which a correction rule is never eligible to match:
 * every matcher (`findAllMatchingCorrectionFromRules`,
 * `findAllMatchingTransactionCorrectionsFromDb`, the live-import call site)
 * filters out rules with `confidence < MIN_MATCH_CONFIDENCE`. Also the schema
 * default and the create/update validation floor, so a rule can never be
 * persisted below the threshold that would make it structurally inert.
 */
export const MIN_MATCH_CONFIDENCE = 0.7;
