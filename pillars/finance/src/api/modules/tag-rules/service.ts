/**
 * Tag-rule ChangeSet service — propose (deterministic) + apply + reject.
 *
 * The `apply` path wraps the ops in a single db transaction so a partial
 * ChangeSet never lands.
 *
 * `propose` takes no feedback argument. It is deterministic in its signal,
 * so feeding it a rejection reason could only have changed the prose it
 * writes into `reason`/`rationale` while returning the identical ops — the
 * "revision" POPS-2598 removed. Rejections are recorded, not re-proposed.
 */
import {
  type FinanceDb,
  tagRuleRejectionsService,
  transactionTagRulesService,
  type TagRuleRejection,
  type TransactionTagRuleRow,
} from '../../../db/index.js';
import { parseStoredTags } from '../../../db/tag-facets.js';
import { previewTagRuleChangeSet } from './preview.js';

import type { TagRuleChangeSet, TagRuleChangeSetOp } from '../../../contract/rest-tag-rules.js';
import type { PreviewInputTransaction, TagRuleChangeSetProposal } from './types.js';

/** Persisted rule with `tags` parsed from its JSON column to a `string[]`. */
export interface TagRule {
  id: string;
  descriptionPattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  entityId: string | null;
  tags: string[];
  isActive: boolean;
  confidence: number;
  priority: number;
  timesApplied: number;
  createdAt: string;
  lastUsedAt: string | null;
}

export function toTagRule(row: TransactionTagRuleRow): TagRule {
  return {
    id: row.id,
    descriptionPattern: row.descriptionPattern,
    matchType: row.matchType,
    entityId: row.entityId,
    tags: parseStoredTags(row.tags),
    isActive: row.isActive,
    confidence: row.confidence,
    priority: row.priority,
    timesApplied: row.timesApplied,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

function applyOp(tx: FinanceDb, op: TagRuleChangeSetOp): void {
  switch (op.op) {
    case 'add':
      transactionTagRulesService.createTransactionTagRule(tx, {
        descriptionPattern: op.data.descriptionPattern,
        matchType: op.data.matchType,
        entityId: op.data.entityId ?? null,
        tags: op.data.tags,
        confidence: op.data.confidence ?? 0.95,
        isActive: op.data.isActive ?? true,
        priority: op.data.priority ?? 0,
      });
      return;
    case 'edit':
      transactionTagRulesService.updateTransactionTagRule(tx, op.id, {
        entityId: op.data.entityId,
        tags: op.data.tags,
        confidence: op.data.confidence,
        isActive: op.data.isActive,
        priority: op.data.priority,
      });
      return;
    case 'disable':
      transactionTagRulesService.disableTransactionTagRule(tx, op.id);
      return;
    case 'remove':
      transactionTagRulesService.deleteTransactionTagRule(tx, op.id);
  }
}

export function applyTagRuleChangeSet(db: FinanceDb, changeSet: TagRuleChangeSet): TagRule[] {
  return db.transaction((tx) => {
    for (const op of changeSet.ops) applyOp(tx, op);
    return transactionTagRulesService.listTransactionTagRules(tx).map(toTagRule);
  });
}

export function proposeTagRuleChangeSet(
  db: FinanceDb,
  args: {
    signal: {
      descriptionPattern: string;
      matchType: 'exact' | 'contains' | 'regex';
      entityId?: string | null;
      tags: string[];
    };
    transactions: PreviewInputTransaction[];
    maxPreviewItems: number;
  }
): TagRuleChangeSetProposal {
  const changeSet: TagRuleChangeSet = {
    source: 'tag-edit-signal',
    reason: 'Create new tag rule from tag edit signal',
    ops: [
      {
        op: 'add',
        data: {
          descriptionPattern: args.signal.descriptionPattern,
          matchType: args.signal.matchType,
          entityId: args.signal.entityId ?? null,
          tags: args.signal.tags,
          confidence: 0.95,
          isActive: true,
        },
      },
    ],
  };

  const preview = previewTagRuleChangeSet(db, {
    changeSet,
    transactions: args.transactions,
    maxPreviewItems: args.maxPreviewItems,
  });

  const rationale = `Add new tag rule (${args.signal.matchType}:${args.signal.descriptionPattern}) from tag edit signal`;

  return { changeSet, rationale, preview };
}

/**
 * Persist a rejected ChangeSet and the reason the user gave for refusing it.
 *
 * The rule shape is read off the ChangeSet's first `add` op — the only op
 * kind that carries a pattern — and is left null for a ChangeSet of
 * edit/disable/remove ops, which refer to rules by id and propose no shape
 * of their own. The ChangeSet is stored verbatim either way, so nothing is
 * lost to that denormalization.
 */
export function recordTagRuleRejection(
  db: FinanceDb,
  args: { changeSet: TagRuleChangeSet; feedback: string }
): TagRuleRejection {
  const addOp = args.changeSet.ops.find(
    (op): op is Extract<TagRuleChangeSetOp, { op: 'add' }> => op.op === 'add'
  );
  return tagRuleRejectionsService.recordTagRuleRejection(db, {
    descriptionPattern: addOp?.data.descriptionPattern ?? null,
    matchType: addOp?.data.matchType ?? null,
    entityId: addOp?.data.entityId ?? null,
    tags: addOp?.data.tags ?? [],
    feedback: args.feedback,
    changeSet: args.changeSet,
  });
}
