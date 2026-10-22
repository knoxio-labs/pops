import { aiUsageService, type AiDb } from '../../../db/index.js';

import type { InferenceRecord } from '@pops/ai-telemetry';

/** Max serialized `metadata` length (bytes) persisted; longer payloads are dropped. */
const METADATA_JSON_CAP = 4096;

function capJson(value: unknown): string | null {
  const json = JSON.stringify(value);
  if (json === undefined || json.length > METADATA_JSON_CAP) return null;
  return json;
}

/**
 * Write one inference record to this pillar's ledger.
 *
 * Shared by the cross-pillar `POST /ai-usage/record` ingest and by this
 * pillar's own model calls, which record in-process rather than over HTTP to
 * themselves. `promptVersion` is merged into `metadata.prompt_version` and the
 * merged metadata is dropped when it exceeds the cap. Throws on insert failure;
 * callers decide whether that is fatal.
 */
export function recordInference(db: AiDb, record: InferenceRecord): void {
  const merged: Record<string, unknown> = { ...record.metadata };
  if (record.promptVersion !== undefined) merged['prompt_version'] = record.promptVersion;
  const metadata = Object.keys(merged).length > 0 ? capJson(merged) : null;

  aiUsageService.createInferenceLog(db, {
    provider: record.provider,
    model: record.model,
    operation: record.operation,
    domain: record.domain,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    costUsd: record.costUsd,
    latencyMs: record.latencyMs,
    status: record.status,
    cached: record.cached ? 1 : 0,
    contextId: record.contextId ?? null,
    errorMessage: record.errorMessage ?? null,
    metadata,
  });
}
