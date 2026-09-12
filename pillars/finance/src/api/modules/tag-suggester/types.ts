export type TagSuggestionSource = 'rule' | 'ai' | 'entity';

export interface SuggestedTag {
  tag: string;
  source: TagSuggestionSource;
  pattern?: string;
  isNew?: boolean;
  /**
   * `true` when a `source: 'rule'` tag came from a tag rule scoped to a
   * specific entity, rather than a global one. Absent for every other tag,
   * including a global rule's — the client needs to tell the two `'rule'`
   * cases apart to drop only the stale one on an entity reassignment
   * (POPS-2624).
   */
  entityScoped?: boolean;
  /** The prompt revision behind a `source: 'ai'` tag (POPS-3677). Absent on every other source. */
  promptVersion?: string;
  /** The model's confidence in an AI suggestion's tags (POPS-3671). Absent on every other source. */
  confidence?: number;
  /** Whether Tag Review may pre-accept an AI suggestion (POPS-3671). Absent on every other source. */
  preAccept?: boolean;
}

/**
 * Where a batch of AI tags came from and how far to trust it: the prompt that
 * produced them, the confidence the model reported for them, and the threshold
 * that confidence has to meet for Tag Review to pre-accept them (POPS-3671).
 */
export interface AiSuggestionProvenance {
  promptVersion?: string;
  confidence?: number;
  preAcceptThreshold: number;
}
