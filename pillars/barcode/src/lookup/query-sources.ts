import { barcodeErrorBody } from '../api/errors.js';
import { createLookupBudget, sourceAttempt } from './budget.js';
import { cacheOutcome } from './cache.js';
import { logProviderAttempt, type BarcodeLookupLogger } from './observability.js';
import { isProductComplete, ProductSchema, type Product } from './product.js';

import type { LookupOutcome } from '../contract/rest-schemas.js';
import type { BarcodeDb } from '../db/index.js';
import type { BookSource } from './source.js';

type BarcodeUnavailableReason = 'provider_unavailable' | 'timeout';
type SourceResult =
  | { readonly kind: 'found'; readonly product: Product }
  | { readonly kind: 'miss' }
  | { readonly kind: 'unavailable'; readonly reason: BarcodeUnavailableReason };

interface SourceContext {
  readonly source: BookSource;
  readonly code: string;
  readonly requestId: string;
  readonly logger?: BarcodeLookupLogger;
  readonly budget: ReturnType<typeof createLookupBudget>;
}

interface QuerySourcesOptions {
  readonly db: BarcodeDb;
  readonly sources: readonly BookSource[];
  readonly code: string;
  readonly requestedAt: Date;
  readonly requestId: string;
  readonly logger?: BarcodeLookupLogger;
}

function unavailableOutcome(
  reason: BarcodeUnavailableReason,
  requestId: string
): Extract<LookupOutcome, { outcome: 'unavailable' }> {
  return {
    outcome: 'unavailable',
    error: barcodeErrorBody(reason === 'timeout' ? 'timeout' : 'provider_unavailable', requestId),
  };
}

function mergeUnavailableReason(
  current: BarcodeUnavailableReason | undefined,
  result: SourceResult
): BarcodeUnavailableReason | undefined {
  if (result.kind !== 'unavailable') return current;
  if (result.reason === 'timeout') return 'timeout';
  return current ?? result.reason;
}

function logUnavailable(
  context: SourceContext,
  startedAt: number,
  failureClass: Parameters<typeof logProviderAttempt>[1]['failureClass'],
  providerStatus?: number
): void {
  logProviderAttempt(context.logger, {
    requestId: context.requestId,
    source: context.source.id,
    outcome: 'unavailable',
    durationMs: Date.now() - startedAt,
    ...(failureClass === undefined ? {} : { failureClass }),
    ...(providerStatus === undefined ? {} : { providerStatus }),
  });
}

function contributorKey(contributor: Product['contributors'][number]): string {
  return `${contributor.name.trim().toLocaleLowerCase()}\u0000${contributor.role?.trim().toLocaleLowerCase() ?? ''}`;
}

function mergeContributors(
  current: Product['contributors'],
  candidate: Product['contributors']
): Product['contributors'] {
  const merged = [...current];
  const seen = new Set(current.map(contributorKey));
  for (const contributor of candidate) {
    const key = contributorKey(contributor);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(contributor);
  }
  return merged;
}

function mergeStrings(current: readonly string[], candidate: readonly string[]): string[] {
  return [...new Set([...current, ...candidate])];
}

function mergeProducts(current: Product, candidate: Product): Product {
  return {
    ...current,
    subtitle: current.subtitle ?? candidate.subtitle,
    contributors: mergeContributors(current.contributors, candidate.contributors),
    publisher: current.publisher ?? candidate.publisher,
    publishedDate: current.publishedDate ?? candidate.publishedDate,
    pageCount: current.pageCount ?? candidate.pageCount,
    language: current.language ?? candidate.language,
    description: current.description ?? candidate.description,
    subjects: mergeStrings(current.subjects, candidate.subjects),
    imageUrls: mergeStrings(current.imageUrls, candidate.imageUrls),
    attributes: { ...candidate.attributes, ...current.attributes },
  };
}

function foundProductOutcome(
  db: BarcodeDb,
  code: string,
  product: Product,
  requestedAt: Date
): Extract<LookupOutcome, { outcome: 'found' }> {
  const outcome = { outcome: 'found' as const, product };
  cacheOutcome(db, code, outcome, requestedAt);
  return outcome;
}

function cacheCompleteProduct(
  db: BarcodeDb,
  code: string,
  product: Product | undefined,
  requestedAt: Date
): Extract<LookupOutcome, { outcome: 'found' }> | undefined {
  return product === undefined || !isProductComplete(product)
    ? undefined
    : foundProductOutcome(db, code, product, requestedAt);
}

function outcomeAfterBudget(
  product: Product | undefined,
  options: QuerySourcesOptions
): LookupOutcome {
  return product === undefined
    ? unavailableOutcome('timeout', options.requestId)
    : foundProductOutcome(options.db, options.code, product, options.requestedAt);
}

async function querySource(context: SourceContext): Promise<SourceResult> {
  const startedAt = Date.now();
  const attempt = await sourceAttempt(context.source, context.code, context.budget);
  if (attempt.kind === 'timeout') {
    logUnavailable(context, startedAt, 'timeout');
    return { kind: 'unavailable', reason: 'timeout' };
  }
  if (context.budget.signal.aborted) return { kind: 'unavailable', reason: 'timeout' };
  if (attempt.answer.kind === 'unavailable') {
    const failureClass = attempt.answer.failureClass ?? 'provider_unavailable';
    logUnavailable(context, startedAt, failureClass, attempt.answer.status);
    return {
      kind: 'unavailable',
      reason: failureClass === 'timeout' ? 'timeout' : 'provider_unavailable',
    };
  }
  if (attempt.answer.kind === 'miss') {
    logProviderAttempt(context.logger, {
      requestId: context.requestId,
      source: context.source.id,
      outcome: 'miss',
      durationMs: Date.now() - startedAt,
    });
    return { kind: 'miss' };
  }

  const parsed = ProductSchema.safeParse(attempt.answer.product);
  if (!parsed.success) {
    logUnavailable(context, startedAt, 'invalid_product');
    return { kind: 'unavailable', reason: 'provider_unavailable' };
  }
  logProviderAttempt(context.logger, {
    requestId: context.requestId,
    source: context.source.id,
    outcome: 'hit',
    durationMs: Date.now() - startedAt,
  });
  return { kind: 'found', product: parsed.data };
}

/** Query ordered providers under one shared lookup budget, enriching partial hits. */
export async function querySources(options: QuerySourcesOptions): Promise<LookupOutcome> {
  const budget = createLookupBudget();
  let unavailableReason: BarcodeUnavailableReason | undefined;
  let product: Product | undefined;
  try {
    for (const source of options.sources) {
      if (budget.signal.aborted) return outcomeAfterBudget(product, options);
      const result = await querySource({
        source,
        code: options.code,
        requestId: options.requestId,
        budget,
        ...(options.logger === undefined ? {} : { logger: options.logger }),
      });
      if (result.kind !== 'found') {
        unavailableReason = mergeUnavailableReason(unavailableReason, result);
        continue;
      }
      product = product === undefined ? result.product : mergeProducts(product, result.product);
      const outcome = cacheCompleteProduct(options.db, options.code, product, options.requestedAt);
      if (outcome !== undefined) return outcome;
    }
    if (product !== undefined) {
      return foundProductOutcome(options.db, options.code, product, options.requestedAt);
    }
    if (unavailableReason !== undefined) {
      return unavailableOutcome(unavailableReason, options.requestId);
    }
    const outcome = { outcome: 'not_found' as const };
    cacheOutcome(options.db, options.code, outcome, options.requestedAt);
    return outcome;
  } finally {
    budget.cancel();
  }
}
