/**
 * ScopeInferenceService — four-tier scope assignment (ingestion-pipeline).
 *
 * The LLM tier goes through the injected {@link IngestLlm} port; the rule tier
 * uses the in-pillar scope-rules config. Model selection is hardcoded (no
 * settings service).
 *
 * Priority:
 *   1. Explicit scopes provided by the caller → returned as-is
 *   2. Rule-based matching from scope-rules.toml
 *   3. LLM-based content analysis
 *   4. Fallback scope from the scope-rules defaults
 *
 * Invalid inferred scopes are silently dropped; the fallback guarantees at
 * least one valid scope is always returned.
 */
import { createScopeReconciliationService } from '../engrams/scope-reconciliation.js';
import { resolveScopes, type ScopeRulesConfig } from '../engrams/scope-rules.js';
import { scopeStringSchema } from '../engrams/scope-schema.js';
import { type IngestLlm } from './llm.js';

import type { ScopeInfo } from '../engrams/scopes.js';
import type { ScopeInferenceOutcome, ScopeInferenceResult } from './types.js';

const OPERATION = 'cerebrum.infer-scopes';
const MAX_TOKENS = 128;
const VOCABULARY_SIZE = 40;
const MAX_PROMPT_SCOPES = 100;

/** The most-used scopes (ties broken alphabetically), capped at `limit`, for use as LLM vocabulary. */
export function topScopesByCount(scopes: ScopeInfo[], limit = VOCABULARY_SIZE): ScopeInfo[] {
  return scopes
    .toSorted((a, b) => b.count - a.count || a.scope.localeCompare(b.scope))
    .slice(0, limit);
}

interface LlmScopeResponse {
  scopes: string[];
  confidence: number;
}

function buildPrompt(body: string, type: string, tags: string[], knownScopes: string[]): string {
  const tagsSection = tags.length > 0 ? `Tags: ${tags.join(', ')}\n` : '';
  const knownScopesSection =
    knownScopes.length > 0
      ? `\nExisting scopes (dot-notation, 2-6 segments). Prefer one of these existing scopes; only coin a new one if none fits:\n${knownScopes.slice(0, MAX_PROMPT_SCOPES).join('\n')}\n`
      : '';

  return `Assign scopes to a personal knowledge management entry. Scopes use dot-notation (e.g. work.projects.karbon, personal.journal, work.learning).

Scope rules:
- Must be 2-6 segments, lowercase alphanumeric + hyphens per segment
- Segment length 1-32 chars
- ".secret." is reserved — do not assign
- Assign 1-3 scopes that best reflect the content domain
${knownScopesSection}
Content type: ${type}
${tagsSection}
Content (first 1500 chars):
---
${body.slice(0, 1500)}${body.length > 1500 ? '\n...[truncated]' : ''}
---

Respond with JSON only:
{
  "scopes": ["<scope.one>", "<scope.two>"],
  "confidence": <float 0.0-1.0>
}`;
}

function parseResponse(text: string): LlmScopeResponse | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1) return null;

  try {
    const raw = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    const scopes = Array.isArray(raw['scopes'])
      ? (raw['scopes'] as unknown[]).filter((s): s is string => typeof s === 'string')
      : [];
    const confidence =
      typeof raw['confidence'] === 'number' ? Math.min(1, Math.max(0, raw['confidence'])) : 0;
    return { scopes, confidence };
  } catch {
    return null;
  }
}

function filterValidScopes(scopes: string[]): string[] {
  return scopes.flatMap((s) => {
    const result = scopeStringSchema.safeParse(s);
    return result.success ? [result.data] : [];
  });
}

function dedupeScopes(scopes: string[]): string[] {
  return [...new Set(scopes)];
}

export interface ScopeInferenceInput {
  body: string;
  type: string;
  tags: string[];
  source: string;
  explicitScopes?: string[];
  knownScopes?: string[];
  /** Known scopes with usage counts, most-used first. Takes precedence over `knownScopes`. */
  vocabulary?: ScopeInfo[];
}

export class ScopeInferenceService {
  constructor(
    private readonly scopeRulesConfig: ScopeRulesConfig,
    private readonly llm: IngestLlm
  ) {}

  async infer(input: ScopeInferenceInput): Promise<ScopeInferenceResult> {
    return (await this.inferWithStatus(input)).inference;
  }

  /**
   * Like {@link infer}, but reports `degraded` when the LLM tier was reached and
   * returned nothing or an unparseable response, so the fallback scope is a
   * placeholder rather than a verdict.
   *
   * LLM output is snapped to the supplied vocabulary through the scope
   * reconciliation service. `vocabulary` (with counts) wins over `knownScopes`.
   */
  async inferWithStatus(input: ScopeInferenceInput): Promise<ScopeInferenceOutcome> {
    if (input.explicitScopes && input.explicitScopes.length > 0) {
      const valid = filterValidScopes(dedupeScopes(input.explicitScopes));
      if (valid.length > 0) {
        return { inference: { scopes: valid, source: 'explicit', confidence: 1 }, degraded: false };
      }
    }

    const ruleScopes = resolveScopes(
      { source: input.source, type: input.type, tags: input.tags },
      this.scopeRulesConfig
    );
    const fallback = this.scopeRulesConfig.defaults.fallback_scope;
    const hasRuleMatch =
      ruleScopes.length > 0 && !(ruleScopes.length === 1 && ruleScopes[0] === fallback);
    if (hasRuleMatch) {
      return {
        inference: { scopes: dedupeScopes(ruleScopes), source: 'rules', confidence: 0.9 },
        degraded: false,
      };
    }

    const vocabulary =
      input.vocabulary ?? (input.knownScopes ?? []).map((scope) => ({ scope, count: 1 }));
    const llmResult = await this.inferViaLlm(input.body, input.type, input.tags, vocabulary);
    if (llmResult.scopes.length > 0) {
      return {
        inference: { scopes: llmResult.scopes, source: 'llm', confidence: llmResult.confidence },
        degraded: false,
      };
    }

    return {
      inference: { scopes: [fallback], source: 'fallback', confidence: 0 },
      degraded: llmResult.degraded,
    };
  }

  private async inferViaLlm(
    body: string,
    type: string,
    tags: string[],
    vocabulary: ScopeInfo[]
  ): Promise<{ scopes: string[]; confidence: number; degraded: boolean }> {
    const text = await this.llm.complete({
      operation: OPERATION,
      model: this.llm.modelFor('scopeInference'),
      prompt: buildPrompt(
        body,
        type,
        tags,
        vocabulary.map((v) => v.scope)
      ),
      maxTokens: MAX_TOKENS,
    });

    if (text === null) return { scopes: [], confidence: 0, degraded: true };

    const parsed = parseResponse(text);
    if (parsed === null) return { scopes: [], confidence: 0, degraded: true };
    const valid = filterValidScopes(dedupeScopes(parsed.scopes));
    return {
      scopes: snapToVocabulary(valid, vocabulary),
      confidence: parsed.confidence,
      degraded: false,
    };
  }
}

function snapToVocabulary(scopes: string[], vocabulary: ScopeInfo[]): string[] {
  if (vocabulary.length === 0) return scopes;
  const { suggestions } = createScopeReconciliationService().reconcile({
    suggestedScopes: scopes,
    knownScopes: vocabulary,
  });
  const canonical = new Map(suggestions.map((s) => [s.original, s.canonical]));
  return dedupeScopes(scopes.map((s) => canonical.get(s) ?? s));
}

/** Convenience factory — builds the service from a pre-loaded config + LLM port. */
export function createScopeInferenceService(
  config: ScopeRulesConfig,
  llm: IngestLlm
): ScopeInferenceService {
  return new ScopeInferenceService(config, llm);
}
