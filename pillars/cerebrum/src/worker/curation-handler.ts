/**
 * Curation handler for the cerebrum worker.
 *
 * Consumes `pops-curation` jobs `{ type: 'classifyEngram', engramId }` and runs
 * the pillar's existing ingest enrichment pipeline against a stored engram —
 * classify + entity-extract + scope resolution — then writes the result back
 * onto the engram (type/template/tags/scopes/referenced_dates).
 *
 * Lifted from the monolith `jobs/handlers/curation.ts`. The classify / extract
 * / scope-inference / scope-reconciliation collaborators are the SAME modules
 * the pillar's `IngestService` (`src/api/modules/ingest`) drives — reused here
 * directly rather than reimplemented, with the injectable {@link IngestLlm} so
 * tests run offline.
 *
 * Idempotent: skips enrichment when the engram body hash matches the
 * `_enrichedHash` recorded on the last run (body hash, not `engram.contentHash`
 * — see the guard in `processCurationJob`). `force` bypasses that guard.
 *
 * A run where any LLM stage was degraded (no response or unparseable) does not
 * stamp `_enrichedHash`, so it stays retryable, and never touches the type. The
 * type changes only for a `capture` engram whose classification cleared the
 * confidence threshold.
 */
import { createScopeReconciliationService } from '../api/modules/engrams/scope-reconciliation.js';
import { ScopeRuleEngine } from '../api/modules/engrams/scope-rules.js';
import { listScopes } from '../api/modules/engrams/scopes.js';
import { EngramService, type UpdateEngramInput } from '../api/modules/engrams/service.js';
import { CortexClassifier } from '../api/modules/ingest/classifier.js';
import { CortexEntityExtractor } from '../api/modules/ingest/entity-extractor.js';
import {
  createScopeInferenceService,
  topScopesByCount,
} from '../api/modules/ingest/scope-inference.js';
import { hashContent } from '../api/modules/thalamus/chunker.js';

import type { ScopeSuggestion } from '../api/modules/engrams/scope-reconciliation.js';
import type { Engram } from '../api/modules/engrams/types.js';
import type { IngestLlm } from '../api/modules/ingest/llm.js';
import type { ClassificationResult } from '../api/modules/ingest/types.js';
import type { TemplateRegistry } from '../api/modules/templates/registry.js';
import type { CerebrumDb } from '../db/index.js';

export interface CurationJobData {
  type: 'classifyEngram';
  engramId: string;
  /** Skip the idempotency guard and re-enrich even when the body hash is unchanged. */
  force?: boolean;
}

export interface CurationHandlerDeps {
  db: CerebrumDb;
  engramRoot: string;
  templates: TemplateRegistry;
  llm: IngestLlm;
}

export interface CurationResult {
  engramId: string;
  enriched: boolean;
  /** An LLM stage failed; partial results were written but the engram stays retryable. */
  degraded?: boolean;
}

interface ScopeResolution {
  scopes: string[];
  reconciled: boolean;
  suggestions: ScopeSuggestion[];
  degraded: boolean;
}

function engramService(deps: CurationHandlerDeps): EngramService {
  return new EngramService({
    root: deps.engramRoot,
    db: deps.db,
    templates: deps.templates,
    scopeRuleEngine: new ScopeRuleEngine(deps.engramRoot),
  });
}

/** Run the curation enrichment for one engram. Returns `enriched: false` when the idempotency guard skips it. */
export async function processCurationJob(
  deps: CurationHandlerDeps,
  job: CurationJobData
): Promise<CurationResult> {
  const service = engramService(deps);
  const { engram, body } = service.read(job.engramId);

  // Idempotency is keyed on the BODY hash, not `engram.contentHash`: the latter
  // covers frontmatter too, so writing the enrichment result (scopes/tags/
  // `_enrichedHash`) would itself change it and the guard would never trip. The
  // body is stable across enrichment writes, so hashing it gives a guard that
  // actually skips an unchanged engram on re-run.
  const bodyHash = hashContent(body);
  if (job.force !== true && engram.customFields['_enrichedHash'] === bodyHash) {
    return { engramId: job.engramId, enriched: false };
  }

  const classifier = new CortexClassifier(deps.llm);
  const entityExtractor = new CortexEntityExtractor(deps.llm);
  const referenceDate = engram.created.slice(0, 10);

  const {
    classification,
    degraded: classifyDegraded,
    accepted,
  } = await classifier.classifyWithStatus(body, engram.title);
  const {
    extraction: { tags: entityTags, referencedDates },
    degraded: extractDegraded,
  } = await entityExtractor.extractWithStatus(body, engram.tags, referenceDate);
  const mergedTags = dedupe([...engram.tags, ...entityTags, ...classification.suggestedTags]);

  const retype = shouldRetype(engram, classification, accepted);

  const scopeResolution = await resolveScopes({
    deps,
    engram,
    body,
    classifiedType: retype ? classification.type : engram.type,
    mergedTags,
  });
  const degraded = classifyDegraded || extractDegraded || scopeResolution.degraded;
  const customFields = buildCustomFields(
    engram,
    degraded ? undefined : bodyHash,
    referencedDates,
    scopeResolution
  );

  const updateInput: UpdateEngramInput = {
    scopes: scopeResolution.scopes,
    tags: mergedTags.length > 0 ? mergedTags : undefined,
    customFields,
  };
  if (retype && classification.template) updateInput.template = classification.template;
  service.update(job.engramId, updateInput);

  if (retype) {
    service.changeType(job.engramId, classification.type);
  }

  return { engramId: job.engramId, enriched: !degraded, degraded };
}

function shouldRetype(
  engram: Engram,
  classification: ClassificationResult,
  accepted: boolean
): boolean {
  return engram.type === 'capture' && accepted && classification.type !== 'capture';
}

function buildCustomFields(
  engram: Engram,
  enrichedHash: string | undefined,
  referencedDates: string[],
  scopeResolution: ScopeResolution
): Record<string, unknown> {
  const customFields: Record<string, unknown> = { ...engram.customFields };
  if (referencedDates.length > 0) customFields['referenced_dates'] = referencedDates;
  if (enrichedHash !== undefined) customFields['_enrichedHash'] = enrichedHash;

  if (scopeResolution.reconciled && scopeResolution.suggestions.length > 0) {
    customFields['_scope_suggestions'] = scopeResolution.suggestions;
  } else {
    delete customFields['_scope_suggestions'];
  }
  return customFields;
}

interface ResolveScopesArgs {
  deps: CurationHandlerDeps;
  engram: Engram;
  body: string;
  classifiedType: string;
  mergedTags: string[];
}

/**
 * Resolve scopes for the engram. When it opted into reconciliation
 * (`_reconcile_scopes: true`), keep the user's scopes and propose canonical
 * alternatives; otherwise run the standard scope-inference pipeline.
 */
async function resolveScopes(args: ResolveScopesArgs): Promise<ScopeResolution> {
  const { deps, engram, body, classifiedType, mergedTags } = args;
  if (engram.customFields['_reconcile_scopes'] === true) {
    const dismissed = engram.customFields['_scope_suggestions_dismissed'];
    const dismissedKeys = Array.isArray(dismissed)
      ? dismissed.filter((v): v is string => typeof v === 'string')
      : [];
    const { suggestions } = createScopeReconciliationService().reconcile({
      suggestedScopes: engram.scopes,
      knownScopes: listScopes(deps.db),
      dismissedSegmentSetKeys: dismissedKeys,
    });
    return { scopes: engram.scopes, reconciled: true, suggestions, degraded: false };
  }

  const ruleEngine = new ScopeRuleEngine(deps.engramRoot);
  const scopeService = createScopeInferenceService(ruleEngine.getConfig(), deps.llm);
  const { inference, degraded } = await scopeService.inferWithStatus({
    body,
    type: classifiedType,
    tags: mergedTags,
    source: engram.source,
    explicitScopes: undefined,
    vocabulary: topScopesByCount(listScopes(deps.db)),
  });
  return {
    scopes: degraded ? engram.scopes : inference.scopes,
    reconciled: false,
    suggestions: [],
    degraded,
  };
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
