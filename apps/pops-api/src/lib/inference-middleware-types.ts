/**
 * Shared types between the inference middleware and its budget-enforcement
 * helper. Extracted into a separate module so the two halves can import the
 * same shapes without creating a cycle.
 */

export interface TrackInferenceParams {
  provider: string;
  model: string;
  operation: string;
  domain?: string;
  contextId?: string;
  cached?: boolean;
}

export interface ResolvedInferenceParams {
  domain: string | null;
  contextId: string | null;
}

export interface InferenceLogInsert {
  provider: string;
  model: string;
  operation: string;
  domain: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  status: string;
  cached: number;
  contextId: string | null;
  errorMessage: string | null;
}
