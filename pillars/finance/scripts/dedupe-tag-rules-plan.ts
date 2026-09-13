/**
 * The pure half of `dedupe-tag-rules.ts` (POPS-3664): what counts as one
 * cluster, which row survives, and when a disagreement may be written. Split
 * out so every verdict is reachable from a test without a database, and so the
 * CLI file stays under the line cap.
 *
 * See `dedupe-tag-rules.ts` for the clustering and delete-not-disable
 * reasoning.
 */
import {
  assertTagRuleWritable,
  isPlaceholderEntityId,
} from '../src/db/services/tag-rule-write-guards.js';

import type { TransactionTagRuleRow } from '../src/db/index.js';

/** One stored rule, as the planner sees it. */
export interface DedupeRule {
  id: string;
  entityId: string | null;
  tags: string[];
  timesApplied: number;
  createdAt: string;
  lastUsedAt: string | null;
}

/** Active rules sharing a normalized `(descriptionPattern, matchType)`. */
export interface PatternBucket {
  descriptionPattern: string;
  matchType: TransactionTagRuleRow['matchType'];
  rules: DedupeRule[];
}

/** Cluster key → the tag set chosen for that conflict. */
export type Resolutions = ReadonlyMap<string, readonly string[]>;

/** What collapsing a cluster onto one row writes. */
export interface Collapse {
  keepId: string;
  removeIds: string[];
  tags: string[];
  timesApplied: number;
  lastUsedAt: string | null;
}

/** The verdict for one cluster, or for one `temp:`-scoped row. */
export type DedupePlan =
  /** The only active rule for its key. Nothing to do. */
  | { kind: 'ok'; key: string; ruleId: string }
  /** Scoped to an unresolved `temp:` placeholder: deleted. */
  | { kind: 'delete-temp-scope'; ruleId: string; entityId: string; descriptionPattern: string }
  /** Every row carries the same tag set: collapsed onto the survivor. */
  | ({ kind: 'merge'; key: string } & Collapse)
  /** Rows disagree. Written only when `resolution` is set, from the resolutions file. */
  | {
      kind: 'conflict';
      key: string;
      rules: { id: string; tags: string[]; timesApplied: number }[];
      resolution: Collapse | null;
    };

/** The planner's output. */
export interface DedupeReport {
  plans: DedupePlan[];
  /** Resolution keys naming no conflict cluster. A non-empty list blocks `--write`. */
  unusedResolutionKeys: string[];
}

/** The identity a cluster is keyed on, printed so a resolutions file can name it. */
export function clusterKey(
  matchType: string,
  descriptionPattern: string,
  entityId: string | null
): string {
  return `${matchType}|${descriptionPattern}|${entityId ?? '*'}`;
}

function tagSetSignature(tags: readonly string[]): string {
  return JSON.stringify([...new Set(tags.map((tag) => tag.trim()))].toSorted());
}

function bySurvivorPreference(a: DedupeRule, b: DedupeRule): number {
  if (a.timesApplied !== b.timesApplied) return b.timesApplied - a.timesApplied;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}

function collapse(rules: readonly DedupeRule[], tags: readonly string[]): Collapse {
  const [keep, ...rest] = rules.toSorted(bySurvivorPreference);
  if (keep === undefined) throw new Error('cannot collapse an empty cluster');
  const lastUsed = rules
    .map((rule) => rule.lastUsedAt)
    .filter((value): value is string => value !== null)
    .toSorted();
  return {
    keepId: keep.id,
    removeIds: rest.map((rule) => rule.id),
    tags: [...tags],
    timesApplied: rules.reduce((sum, rule) => sum + rule.timesApplied, 0),
    lastUsedAt: lastUsed.at(-1) ?? null,
  };
}

function planCluster(key: string, rules: DedupeRule[], resolutions: Resolutions): DedupePlan {
  const [first] = rules;
  if (first === undefined) throw new Error(`empty cluster ${key}`);
  if (rules.length === 1) return { kind: 'ok', key, ruleId: first.id };

  const signatures = new Set(rules.map((rule) => tagSetSignature(rule.tags)));
  if (signatures.size === 1) return { kind: 'merge', key, ...collapse(rules, first.tags) };

  const chosen = resolutions.get(key);
  return {
    kind: 'conflict',
    key,
    rules: rules.map((rule) => ({ id: rule.id, tags: rule.tags, timesApplied: rule.timesApplied })),
    resolution: chosen === undefined ? null : collapse(rules, chosen),
  };
}

/**
 * Decide what to do with every active rule. Pure — the caller loads the
 * buckets and applies the plans.
 *
 * `temp:`-scoped rows are planned for deletion and kept out of clustering; the
 * rest are clustered on `(matchType, pattern, entityId)`, so rules for
 * different entities, or global versus scoped, are never one cluster.
 */
export function planDedupe(
  buckets: readonly PatternBucket[],
  resolutions: Resolutions = new Map()
): DedupeReport {
  const plans: DedupePlan[] = [];
  for (const bucket of buckets) {
    const clusters = new Map<string, DedupeRule[]>();
    for (const rule of bucket.rules) {
      if (isPlaceholderEntityId(rule.entityId)) {
        plans.push({
          kind: 'delete-temp-scope',
          ruleId: rule.id,
          entityId: rule.entityId,
          descriptionPattern: bucket.descriptionPattern,
        });
        continue;
      }
      const key = clusterKey(bucket.matchType, bucket.descriptionPattern, rule.entityId);
      const cluster = clusters.get(key);
      if (cluster) cluster.push(rule);
      else clusters.set(key, [rule]);
    }
    for (const [key, rules] of clusters) plans.push(planCluster(key, rules, resolutions));
  }

  const conflictKeys = new Set(
    plans.flatMap((plan) => (plan.kind === 'conflict' ? [plan.key] : []))
  );
  const unusedResolutionKeys = [...resolutions.keys()].filter((key) => !conflictKeys.has(key));
  return { plans, unusedResolutionKeys };
}

/**
 * Parse a resolutions file's JSON. Every value must be a non-empty array of
 * non-blank strings, and must pass the same write guard a rule create does —
 * a resolution is a tag-rule write, and may not reintroduce a marker tag.
 *
 * @throws {Error} on a malformed file
 * @throws {MarkerFacetTagRuleError} on a resolution carrying a marker tag
 */
export function parseResolutions(json: unknown): Resolutions {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error('resolutions file must be a JSON object of cluster key -> tag array');
  }
  const resolutions = new Map<string, string[]>();
  for (const [key, value] of Object.entries(json)) {
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      !value.every((tag): tag is string => typeof tag === 'string' && tag.trim() !== '')
    ) {
      throw new Error(`resolution for ${key} must be a non-empty array of tags`);
    }
    assertTagRuleWritable({ tags: value });
    resolutions.set(key, value);
  }
  return resolutions;
}
