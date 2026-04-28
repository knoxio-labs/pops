/**
 * ReflexService — core orchestrator for the reflex system (PRD-089).
 *
 * Loads and watches `reflexes.toml`, maintains a registry, matches
 * events/thresholds/schedules, and logs execution history.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { watch as chokidarWatch, type FSWatcher } from 'chokidar';
import { eq } from 'drizzle-orm';

import { reflexExecutions } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { toReflexExecution, updateEnabledInToml, buildTestTriggerData } from './reflex-helpers.js';
import { parseReflexesToml } from './reflex-parser.js';
import { enrichWithStatus, getReflexHistory, queryExecutionHistory } from './reflex-queries.js';
import { matchesEventTrigger, resolveTemplateVariables } from './triggers/event-trigger.js';
import { evaluateThreshold, createInitialThresholdState } from './triggers/threshold-trigger.js';

import type { ParseError } from './reflex-parser.js';
import type { ThresholdState } from './triggers/threshold-trigger.js';
import type {
  ReflexDefinition,
  ReflexExecution,
  ReflexWithStatus,
  EngramEventPayload,
  TriggerType,
  ExecutionStatus,
  ActionType,
} from './types.js';

export class ReflexService {
  private reflexes: ReflexDefinition[] = [];
  private parseErrors: ParseError[] = [];
  private watcher: FSWatcher | null = null;
  private readonly configPath: string;
  private readonly thresholdStates = new Map<string, ThresholdState>();
  private readonly runningReflexes = new Set<string>();

  constructor(engramRoot: string) {
    this.configPath = join(engramRoot, '.config', 'reflexes.toml');
  }

  start(): void {
    this.loadFromDisk();
    this.startWatcher();
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.reflexes = [];
    this.parseErrors = [];
    this.thresholdStates.clear();
    this.runningReflexes.clear();
  }

  getAll(): ReflexDefinition[] {
    return this.reflexes;
  }
  getByName(name: string): ReflexDefinition | undefined {
    return this.reflexes.find((r) => r.name === name);
  }
  getEnabled(): ReflexDefinition[] {
    return this.reflexes.filter((r) => r.enabled);
  }
  getByTriggerType(type: TriggerType): ReflexDefinition[] {
    return this.reflexes.filter((r) => r.trigger.type === type);
  }
  getParseErrors(): ParseError[] {
    return this.parseErrors;
  }

  processEvent(payload: EngramEventPayload): string[] {
    return this.getEnabled()
      .filter((r) => matchesEventTrigger(r, payload))
      .map((reflex) => {
        const resolvedTarget = reflex.action.target
          ? resolveTemplateVariables(reflex.action.target, payload)
          : undefined;
        return this.logExecution({
          reflexName: reflex.name,
          triggerType: 'event',
          triggerData: {
            event: payload.event,
            engramId: payload.engramId,
            engramType: payload.engramType,
            scopes: payload.scopes,
            source: payload.source,
            changes: payload.changes,
          },
          actionType: reflex.action.type,
          actionVerb: reflex.action.verb,
          status: 'triggered',
          result: resolvedTarget ? { resolvedTarget } : null,
        });
      });
  }

  evaluateThresholds(metrics: Record<string, number>): string[] {
    const ids: string[] = [];
    for (const reflex of this.getEnabled().filter((r) => r.trigger.type === 'threshold')) {
      if (reflex.trigger.type !== 'threshold') continue;
      const val = metrics[reflex.trigger.metric];
      if (val === undefined) continue;
      const state = this.thresholdStates.get(reflex.name) ?? createInitialThresholdState();
      const { shouldFire, newState } = evaluateThreshold(reflex, val, state);
      this.thresholdStates.set(reflex.name, newState);
      if (shouldFire) {
        ids.push(
          this.logExecution({
            reflexName: reflex.name,
            triggerType: 'threshold',
            triggerData: {
              metric: reflex.trigger.metric,
              value: val,
              threshold: reflex.trigger.value,
            },
            actionType: reflex.action.type,
            actionVerb: reflex.action.verb,
            status: 'triggered',
            result: null,
          })
        );
      }
    }
    return ids;
  }

  fireScheduled(reflexName: string): string | null {
    const reflex = this.getByName(reflexName);
    if (!reflex || !reflex.enabled || reflex.trigger.type !== 'schedule') return null;
    if (this.runningReflexes.has(reflexName)) {
      console.warn(`[reflex] Skipping scheduled "${reflexName}" — previous still running`);
      return null;
    }
    this.runningReflexes.add(reflexName);
    return this.logExecution({
      reflexName: reflex.name,
      triggerType: 'schedule',
      triggerData: { cron: reflex.trigger.cron, firedAt: new Date().toISOString() },
      actionType: reflex.action.type,
      actionVerb: reflex.action.verb,
      status: 'triggered',
      result: null,
    });
  }

  completeExecution(
    executionId: string,
    status: ExecutionStatus,
    result: Record<string, unknown> | null
  ): void {
    const db = getDrizzle();
    db.update(reflexExecutions)
      .set({
        status,
        result: result ? JSON.stringify(result) : null,
        completedAt: new Date().toISOString(),
      })
      .where(eq(reflexExecutions.id, executionId))
      .run();
    const row = db
      .select({ reflexName: reflexExecutions.reflexName })
      .from(reflexExecutions)
      .where(eq(reflexExecutions.id, executionId))
      .get();
    if (row) this.runningReflexes.delete(row.reflexName);
  }

  listWithStatus(timezone?: string): ReflexWithStatus[] {
    return this.reflexes.map((r) => enrichWithStatus(r, timezone));
  }

  getWithHistory(
    name: string,
    limit = 20
  ): { reflex: ReflexWithStatus; history: ReflexExecution[] } | null {
    const reflex = this.getByName(name);
    return reflex ? getReflexHistory(reflex, limit) : null;
  }

  testReflex(name: string): ReflexExecution | null {
    const reflex = this.getByName(name);
    if (!reflex) return null;
    const id = this.logExecution({
      reflexName: reflex.name,
      triggerType: reflex.trigger.type,
      triggerData: buildTestTriggerData(reflex),
      actionType: reflex.action.type,
      actionVerb: reflex.action.verb,
      status: 'completed',
      result: { dryRun: true, wouldExecute: `${reflex.action.type}:${reflex.action.verb}` },
    });
    const row = getDrizzle()
      .select()
      .from(reflexExecutions)
      .where(eq(reflexExecutions.id, id))
      .get();
    return row ? toReflexExecution(row) : null;
  }

  enableReflex(name: string): boolean {
    return this.setReflexEnabled(name, true);
  }
  disableReflex(name: string): boolean {
    return this.setReflexEnabled(name, false);
  }

  getHistory(opts: {
    name?: string;
    triggerType?: TriggerType;
    status?: ExecutionStatus;
    limit?: number;
    offset?: number;
  }): { executions: ReflexExecution[]; total: number } {
    return queryExecutionHistory(opts);
  }

  private loadFromDisk(): void {
    if (!existsSync(this.configPath)) {
      console.warn(`[reflex] reflexes.toml not found at ${this.configPath}`);
      this.reflexes = [];
      this.parseErrors = [];
      return;
    }
    let text: string;
    try {
      text = readFileSync(this.configPath, 'utf8');
    } catch (err) {
      console.error(`[reflex] Failed to read: ${(err as Error).message}`);
      this.reflexes = [];
      this.parseErrors = [{ reflexName: null, message: (err as Error).message }];
      return;
    }
    const result = parseReflexesToml(text);
    this.reflexes = result.reflexes;
    this.parseErrors = result.errors;
    for (const e of result.errors)
      console.warn(`[reflex] ${e.reflexName ? `"${e.reflexName}": ` : ''}${e.message}`);
    for (const key of this.thresholdStates.keys()) {
      if (!this.reflexes.some((r) => r.name === key)) this.thresholdStates.delete(key);
    }
    console.warn(`[reflex] Loaded ${this.reflexes.length} reflex(es)`);
  }

  private startWatcher(): void {
    if (this.watcher) return;
    try {
      this.watcher = chokidarWatch(this.configPath, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      });
      this.watcher.on('change', () => {
        console.warn('[reflex] reflexes.toml changed — reloading');
        this.loadFromDisk();
      });
      this.watcher.on('error', (err: unknown) => {
        console.error(`[reflex] Watcher error: ${(err as Error).message}`);
      });
    } catch (err) {
      console.error(`[reflex] Watcher start failed: ${(err as Error).message}`);
    }
  }

  private setReflexEnabled(name: string, enabled: boolean): boolean {
    if (!this.getByName(name)) return false;
    try {
      const updated = updateEnabledInToml(readFileSync(this.configPath, 'utf8'), name, enabled);
      if (!updated) return false;
      writeFileSync(this.configPath, updated, 'utf8');
      this.loadFromDisk();
      return true;
    } catch (err) {
      console.error(`[reflex] TOML update failed: ${(err as Error).message}`);
      return false;
    }
  }

  private logExecution(entry: {
    reflexName: string;
    triggerType: TriggerType;
    triggerData: Record<string, unknown> | null;
    actionType: ActionType;
    actionVerb: string;
    status: ExecutionStatus;
    result: Record<string, unknown> | null;
  }): string {
    const now = new Date().toISOString();
    const id = `rex_${entry.reflexName}_${Date.now()}`;
    getDrizzle()
      .insert(reflexExecutions)
      .values({
        id,
        reflexName: entry.reflexName,
        triggerType: entry.triggerType,
        triggerData: entry.triggerData ? JSON.stringify(entry.triggerData) : null,
        actionType: entry.actionType,
        actionVerb: entry.actionVerb,
        status: entry.status,
        result: entry.result ? JSON.stringify(entry.result) : null,
        triggeredAt: now,
        completedAt: entry.status === 'completed' || entry.status === 'failed' ? now : null,
      })
      .run();
    return id;
  }
}
