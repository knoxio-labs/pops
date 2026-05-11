/**
 * Public types for the Query surface (PRD-082).
 *
 * Mirror of the server-side `QueryRequest` / `QueryResponse` /
 * `SourceCitation` shapes from
 * `apps/pops-api/src/modules/cerebrum/query/types.ts`. Re-declared here
 * because frontend packages may not import from the API source tree
 * per the PRD-097 package boundaries.
 */

export const QUERY_DOMAINS = ['engrams', 'transactions', 'media', 'inventory'] as const;
export type QueryDomain = (typeof QUERY_DOMAINS)[number];

export const QUERY_CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type QueryConfidence = (typeof QUERY_CONFIDENCE_LEVELS)[number];

/**
 * A single source citation as returned from `cerebrum.query.ask`.
 * `id` is an engram id when `type === 'engram'` — for those rows we
 * render a clickable link to `/cerebrum/engrams/:id`.
 */
export interface QuerySourceCitation {
  id: string;
  type: string;
  title: string;
  excerpt: string;
  relevance: number;
  scope: string;
}

/** Server response shape of `cerebrum.query.ask`. */
export interface QueryAnswer {
  answer: string;
  sources: QuerySourceCitation[];
  /** Scopes used for retrieval — explicit when the user filtered, otherwise inferred. */
  scopes: string[];
  confidence: QueryConfidence;
}

/**
 * Mutable form state owned by the page. All free-text inputs are stored
 * as raw strings; list-shaped fields (`scopes`, `domains`) carry the
 * normalised array form for ergonomic toggling.
 */
export interface QueryFormState {
  question: string;
  scopes: string;
  domains: QueryDomain[];
  includeSecret: boolean;
}

export const DEFAULT_QUERY_FORM: QueryFormState = {
  question: '',
  scopes: '',
  domains: [],
  includeSecret: false,
};

/**
 * Persisted query history entry. Stored in `localStorage` so re-runs
 * survive a reload. The entry captures everything needed to replay the
 * query exactly as it was submitted.
 */
export interface QueryHistoryEntry {
  /** Stable id — a millisecond timestamp string. */
  id: string;
  /** ISO timestamp of when the query was submitted. */
  submittedAt: string;
  question: string;
  scopes: string[];
  domains: QueryDomain[];
  includeSecret: boolean;
  /** Cached confidence so the sidebar can show it without re-running. */
  lastConfidence: QueryConfidence | null;
  /** Number of sources the answer cited — surfaced in the sidebar. */
  lastSourceCount: number;
}
