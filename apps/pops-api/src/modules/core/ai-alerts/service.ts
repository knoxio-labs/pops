/**
 * CRUD service for `ai_alert_rules` (PRD-092 US-07).
 *
 * Exposes pure functions used by the tRPC router and seeding scripts.
 */
import { eq } from 'drizzle-orm';

import { aiAlertRules } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { ruleRowToRule } from './mappers.js';

import type { AlertRule, AlertRuleType } from './types.js';

export interface CreateAlertRuleInput {
  type: AlertRuleType;
  scopeProvider?: string | null;
  scopeModel?: string | null;
  thresholdValue: number;
  windowMinutes?: number | null;
  enabled?: boolean;
}

export interface UpdateAlertRuleInput {
  id: number;
  type?: AlertRuleType;
  scopeProvider?: string | null;
  scopeModel?: string | null;
  thresholdValue?: number;
  windowMinutes?: number | null;
  enabled?: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Resolve the next `enabled` integer flag from update input + existing state. */
function resolveEnabledFlag(next: boolean | undefined, current: boolean): 0 | 1 {
  const value = next === undefined ? current : next;
  return value ? 1 : 0;
}

export function listRules(): AlertRule[] {
  return getDrizzle().select().from(aiAlertRules).all().map(ruleRowToRule);
}

export function getRule(id: number): AlertRule | null {
  const [row] = getDrizzle().select().from(aiAlertRules).where(eq(aiAlertRules.id, id)).all();
  return row ? ruleRowToRule(row) : null;
}

export function createRule(input: CreateAlertRuleInput): AlertRule {
  const now = nowIso();
  const db = getDrizzle();
  const result = db
    .insert(aiAlertRules)
    .values({
      type: input.type,
      scopeProvider: input.scopeProvider ?? null,
      scopeModel: input.scopeModel ?? null,
      thresholdValue: input.thresholdValue,
      windowMinutes: input.windowMinutes ?? null,
      enabled: input.enabled === false ? 0 : 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .all();
  const row = result[0];
  if (!row) throw new Error('Insert into ai_alert_rules returned no rows');
  return ruleRowToRule(row);
}

export function updateRule(input: UpdateAlertRuleInput): AlertRule {
  const existing = getRule(input.id);
  if (!existing) throw new Error(`Alert rule not found: ${input.id}`);
  const now = nowIso();
  const db = getDrizzle();
  const result = db
    .update(aiAlertRules)
    .set({
      type: input.type ?? existing.type,
      scopeProvider:
        input.scopeProvider === undefined ? existing.scopeProvider : input.scopeProvider,
      scopeModel: input.scopeModel === undefined ? existing.scopeModel : input.scopeModel,
      thresholdValue: input.thresholdValue ?? existing.thresholdValue,
      windowMinutes:
        input.windowMinutes === undefined ? existing.windowMinutes : input.windowMinutes,
      enabled: resolveEnabledFlag(input.enabled, existing.enabled),
      updatedAt: now,
    })
    .where(eq(aiAlertRules.id, input.id))
    .returning()
    .all();
  const row = result[0];
  if (!row) throw new Error(`Update returned no rows for rule ${input.id}`);
  return ruleRowToRule(row);
}

export function setRuleEnabled(id: number, enabled: boolean): AlertRule {
  return updateRule({ id, enabled });
}

export function deleteRule(id: number): { success: boolean } {
  const result = getDrizzle().delete(aiAlertRules).where(eq(aiAlertRules.id, id)).run();
  return { success: result.changes > 0 };
}

/**
 * Idempotently seed default alert rules per PRD-092 US-07. Returns the number
 * of rules created (0 when any rule of the same type already exists).
 */
export function seedDefaultRules(): number {
  const existing = listRules();
  if (existing.length > 0) return 0;
  const defaults: CreateAlertRuleInput[] = [
    { type: 'budget-threshold', thresholdValue: 80 },
    { type: 'error-spike', thresholdValue: 10, windowMinutes: 60 },
    { type: 'latency-degradation', thresholdValue: 10_000, windowMinutes: 60 },
  ];
  let created = 0;
  for (const def of defaults) {
    createRule(def);
    created += 1;
  }
  return created;
}
