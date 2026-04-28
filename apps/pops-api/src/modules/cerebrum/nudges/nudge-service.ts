/**
 * NudgeService (PRD-084) — orchestrator for all nudge detectors.
 *
 * Coordinates consolidation, staleness, and pattern detection, persists
 * nudge candidates to the nudge_log table, and handles cooldown/dedup,
 * pending-cap enforcement, dismiss, and act operations.
 */
import { and, count, eq, inArray, sql } from 'drizzle-orm';

import { engramIndex, engramScopes, engramTags, nudgeLog } from '@pops/db-types';

import { logger } from '../../../lib/logger.js';
import { generateNudgeId, rowToNudge } from './nudge-helpers.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { HybridSearchService } from '../retrieval/hybrid-search.js';
import type { ConsolidationDetector } from './detectors/consolidation.js';
import type { PatternDetector } from './detectors/patterns.js';
import type { StalenessDetector } from './detectors/staleness.js';
import type { NudgeLogRow } from './nudge-helpers.js';
import type {
  EngramSummary,
  Nudge,
  NudgeCandidate,
  NudgeStatus,
  NudgeThresholds,
  NudgeType,
} from './types.js';

export interface NudgeServiceDeps {
  db: BetterSQLite3Database;
  searchService: HybridSearchService;
  consolidationDetector: ConsolidationDetector;
  stalenessDetector: StalenessDetector;
  patternDetector: PatternDetector;
  thresholds: NudgeThresholds;
  now?: () => Date;
}

export interface ListNudgesOptions {
  type?: NudgeType;
  status?: NudgeStatus;
  priority?: Nudge['priority'];
  limit?: number;
  offset?: number;
}

export class NudgeService {
  private readonly db: BetterSQLite3Database;
  private readonly consolidationDetector: ConsolidationDetector;
  private readonly stalenessDetector: StalenessDetector;
  private readonly patternDetector: PatternDetector;
  private readonly thresholds: NudgeThresholds;
  private readonly now: () => Date;

  constructor(deps: NudgeServiceDeps) {
    this.db = deps.db;
    this.consolidationDetector = deps.consolidationDetector;
    this.stalenessDetector = deps.stalenessDetector;
    this.patternDetector = deps.patternDetector;
    this.thresholds = deps.thresholds;
    this.now = deps.now ?? (() => new Date());
  }

  /** Run a full nudge scan, optionally filtered by type. */
  async scan(type?: NudgeType): Promise<{ created: number }> {
    const engrams = this.loadActiveEngrams();
    let totalCreated = 0;

    if (!type || type === 'consolidation') {
      totalCreated += this.persistCandidates(
        (await this.consolidationDetector.detect(engrams)).nudges
      );
    }
    if (!type || type === 'staleness') {
      totalCreated += this.persistCandidates(this.stalenessDetector.detect(engrams).nudges);
    }
    if (!type || type === 'pattern') {
      totalCreated += this.persistCandidates(this.patternDetector.detect(engrams).nudges);
    }

    this.enforcePendingCap();
    logger.info({ created: totalCreated, type: type ?? 'all' }, '[NudgeService] Scan complete');
    return { created: totalCreated };
  }

  /** List nudges with optional filters. */
  list(opts: ListNudgesOptions = {}): { nudges: Nudge[]; total: number } {
    const conditions = [];
    if (opts.type) conditions.push(eq(nudgeLog.type, opts.type));
    if (opts.status) conditions.push(eq(nudgeLog.status, opts.status));
    if (opts.priority) conditions.push(eq(nudgeLog.priority, opts.priority));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    const baseQuery = this.db.select().from(nudgeLog);
    const rows = (where ? baseQuery.where(where) : baseQuery)
      .orderBy(sql`${nudgeLog.createdAt} desc`)
      .limit(limit)
      .offset(offset)
      .all();

    const countQuery = this.db.select({ total: count() }).from(nudgeLog);
    const [totalRow] = (where ? countQuery.where(where) : countQuery).all();

    return {
      nudges: rows.map((r) => rowToNudge(r as unknown as NudgeLogRow)),
      total: totalRow?.total ?? 0,
    };
  }

  /** Get a single nudge by ID. */
  get(id: string): Nudge | null {
    const [row] = this.db.select().from(nudgeLog).where(eq(nudgeLog.id, id)).all();
    return row ? rowToNudge(row as unknown as NudgeLogRow) : null;
  }

  /** Dismiss a nudge — permanently mark it as dismissed. */
  dismiss(id: string): { success: boolean } {
    const result = this.db
      .update(nudgeLog)
      .set({ status: 'dismissed' })
      .where(and(eq(nudgeLog.id, id), eq(nudgeLog.status, 'pending')))
      .run();
    return { success: result.changes > 0 };
  }

  /** Mark a nudge as acted. The caller executes the action externally. */
  act(id: string): { success: boolean; nudge: Nudge | null } {
    const result = this.db
      .update(nudgeLog)
      .set({ status: 'acted', actedAt: this.now().toISOString() })
      .where(and(eq(nudgeLog.id, id), eq(nudgeLog.status, 'pending')))
      .run();
    return result.changes > 0
      ? { success: true, nudge: this.get(id) }
      : { success: false, nudge: null };
  }

  /** Update detection thresholds. */
  configure(thresholds: Partial<NudgeThresholds>): { success: boolean } {
    Object.assign(this.thresholds, thresholds);
    return { success: true };
  }

  /** Load active engrams from the index for detector input. */
  private loadActiveEngrams(): EngramSummary[] {
    const rows = this.db
      .select()
      .from(engramIndex)
      .where(sql`${engramIndex.status} NOT IN ('archived', 'consolidated')`)
      .all();
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const scopeMap = this.buildLookup(
      this.db
        .select({ engramId: engramScopes.engramId, val: engramScopes.scope })
        .from(engramScopes)
        .where(inArray(engramScopes.engramId, ids))
        .all()
    );
    const tagMap = this.buildLookup(
      this.db
        .select({ engramId: engramTags.engramId, val: engramTags.tag })
        .from(engramTags)
        .where(inArray(engramTags.engramId, ids))
        .all()
    );

    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      status: r.status,
      scopes: scopeMap.get(r.id) ?? [],
      tags: tagMap.get(r.id) ?? [],
      createdAt: r.createdAt,
      modifiedAt: r.modifiedAt,
    }));
  }

  /** Group rows by engramId. */
  private buildLookup(rows: { engramId: string; val: string }[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const r of rows) {
      const arr = map.get(r.engramId);
      if (arr) arr.push(r.val);
      else map.set(r.engramId, [r.val]);
    }
    return map;
  }

  /** Persist nudge candidates, enforcing cooldown dedup. */
  private persistCandidates(candidates: NudgeCandidate[]): number {
    let created = 0;
    for (const candidate of candidates) {
      if (this.isInCooldown(candidate)) continue;
      this.db
        .insert(nudgeLog)
        .values({
          id: generateNudgeId(candidate.type, this.now()),
          type: candidate.type,
          title: candidate.title,
          body: candidate.body,
          engramIds: JSON.stringify(candidate.engramIds),
          priority: candidate.priority,
          status: 'pending',
          createdAt: this.now().toISOString(),
          expiresAt: candidate.expiresAt,
          actionType: candidate.action?.type ?? null,
          actionLabel: candidate.action?.label ?? null,
          actionParams: candidate.action ? JSON.stringify(candidate.action.params) : null,
        })
        .run();
      created++;
    }
    return created;
  }

  /** Check cooldown: same type + same engram IDs within the cooldown window. */
  private isInCooldown(candidate: NudgeCandidate): boolean {
    const cooldownMs = this.thresholds.nudgeCooldownHours * 60 * 60 * 1000;
    const cutoff = new Date(this.now().getTime() - cooldownMs).toISOString();
    const sortedIds = JSON.stringify([...candidate.engramIds].toSorted());

    const recent = this.db
      .select({ engramIds: nudgeLog.engramIds })
      .from(nudgeLog)
      .where(and(eq(nudgeLog.type, candidate.type), sql`${nudgeLog.createdAt} >= ${cutoff}`))
      .all();

    return recent.some((row) => {
      const existing = JSON.stringify((JSON.parse(row.engramIds) as string[]).toSorted());
      return existing === sortedIds;
    });
  }

  /** Enforce the max pending nudges cap. */
  private enforcePendingCap(): void {
    const [countRow] = this.db
      .select({ total: count() })
      .from(nudgeLog)
      .where(eq(nudgeLog.status, 'pending'))
      .all();

    const pendingCount = countRow?.total ?? 0;
    if (pendingCount <= this.thresholds.maxPendingNudges) return;

    const excess = pendingCount - this.thresholds.maxPendingNudges;
    const oldest = this.db
      .select({ id: nudgeLog.id })
      .from(nudgeLog)
      .where(eq(nudgeLog.status, 'pending'))
      .orderBy(nudgeLog.createdAt)
      .limit(excess)
      .all();

    if (oldest.length > 0) {
      this.db
        .update(nudgeLog)
        .set({ status: 'expired' })
        .where(
          inArray(
            nudgeLog.id,
            oldest.map((r) => r.id)
          )
        )
        .run();
      logger.info({ expired: oldest.length }, '[NudgeService] Expired oldest pending nudges');
    }
  }
}
