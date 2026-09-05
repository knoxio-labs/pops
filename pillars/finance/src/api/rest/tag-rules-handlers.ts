/**
 * Handlers for the `tagRules.*` sub-router. `list`/`get`/`matchPreview` are
 * read-only projections (no telemetry side effects — a view must never
 * mutate `timesApplied`/`lastUsedAt`); `update`/`disable`/`delete` are real
 * mutations against `transaction_tag_rules`. The propose/preview paths are
 * pure deterministic computations over caller-supplied transactions; apply
 * mutates `transaction_tag_rules` (and upserts accepted vocabulary tags)
 * inside a single db transaction. `reject` writes the refused ChangeSet and
 * the user's reason to `tag_rule_rejections` and returns nothing else —
 * there is no revision engine behind tag rules, so it must not claim one
 * (POPS-2598).
 *
 * `TransactionTagRuleNotFoundError` (an edit/disable/remove op, or a direct
 * get/update/disable/delete, on an unknown id) maps to 404.
 */
import {
  type FinanceDb,
  tagVocabularyService,
  transactionCorrectionsService,
  transactionTagRulesService,
  InvalidPatternError,
  TransactionTagRuleNotFoundError,
  UnmatchablePatternError,
} from '../../db/index.js';
import { TAG_FACETS } from '../../db/tag-facets.js';
import { previewTagRuleChangeSet } from '../modules/tag-rules/preview.js';
import { applyTagRuleToExistingTransactions } from '../modules/tag-rules/retroactive-apply.js';
import {
  applyTagRuleChangeSet,
  proposeTagRuleChangeSet,
  recordTagRuleRejection,
  toTagRule,
} from '../modules/tag-rules/service.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import { paginationMeta } from '../shared/pagination.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeTagRulesContract } from '../../contract/rest-tag-rules.js';
import type { TagRuleLedgerMatchStatus } from '../../db/index.js';
import type { TagRule } from '../modules/tag-rules/service.js';

type Req = ServerInferRequest<typeof financeTagRulesContract>;

/** {@link TagRule} plus its ledger-match verdict (POPS-2941). */
type TagRuleWithLedgerStatus = TagRule & { ledgerMatchStatus: TagRuleLedgerMatchStatus };

/**
 * Annotate rules with whether their pattern matches anything in the ledger.
 *
 * One `loadTagRuleLedgerSnapshot` fetch for the whole call, reused across
 * every rule passed in — the cost the `list`/`get` handlers pay is one
 * `transactions` scan per request, not one per rule (POPS-2941).
 */
function withLedgerMatchStatus(
  db: FinanceDb,
  rules: readonly TagRule[]
): TagRuleWithLedgerStatus[] {
  const snapshot = transactionTagRulesService.loadTagRuleLedgerSnapshot(db);
  return rules.map((rule) => ({
    ...rule,
    ledgerMatchStatus: transactionTagRulesService.tagRuleLedgerMatchStatus(rule, snapshot),
  }));
}

/** {@link withLedgerMatchStatus} for the single-rule `get` response. */
function withLedgerMatchStatusOne(db: FinanceDb, rule: TagRule): TagRuleWithLedgerStatus {
  const snapshot = transactionTagRulesService.loadTagRuleLedgerSnapshot(db);
  return {
    ...rule,
    ledgerMatchStatus: transactionTagRulesService.tagRuleLedgerMatchStatus(rule, snapshot),
  };
}

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;
const MATCH_PREVIEW_DEFAULT_LIMIT = 100;
const MATCH_PREVIEW_HARD_LIMIT = 500;

function translateTagRuleError(err: unknown, id?: string): never {
  if (err instanceof TransactionTagRuleNotFoundError) {
    throw new NotFoundError('TagRule', id ?? err.id);
  }
  if (err instanceof InvalidPatternError || err instanceof UnmatchablePatternError) {
    throw new ValidationError(err.message);
  }
  throw err;
}

export function makeTagRulesHandlers(db: FinanceDb) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;

        let isActiveFilter: boolean | undefined;
        if (query.isActive === 'true') isActiveFilter = true;
        else if (query.isActive === 'false') isActiveFilter = false;

        const { rows, total } = transactionTagRulesService.listTransactionTagRulesPage(db, {
          matchType: query.matchType,
          isActive: isActiveFilter,
          minConfidence: query.minConfidence,
          limit,
          offset,
        });
        return {
          status: 200 as const,
          body: {
            data: withLedgerMatchStatus(db, rows.map(toTagRule)),
            pagination: paginationMeta(total, limit, offset),
          },
        };
      }),

    vocabulary: () =>
      runHttp(() => ({
        status: 200 as const,
        body: { tags: tagVocabularyService.listVocabularyTags(db) },
      })),

    facets: () => runHttp(() => ({ status: 200 as const, body: { facets: [...TAG_FACETS] } })),

    matchPreview: ({ body }: Req['matchPreview']) =>
      runHttp(() => {
        const limit = Math.min(body.limit ?? MATCH_PREVIEW_DEFAULT_LIMIT, MATCH_PREVIEW_HARD_LIMIT);
        const data = transactionCorrectionsService.previewRuleMatchTransactions(db, {
          pattern: body.pattern,
          matchType: body.matchType,
          limit,
          offset: body.offset ?? DEFAULT_OFFSET,
        });
        return { status: 200 as const, body: { data } };
      }),

    get: ({ params }: Req['get']) =>
      runHttp(() => {
        try {
          const row = transactionTagRulesService.getTransactionTagRule(db, params.id);
          return {
            status: 200 as const,
            body: { data: withLedgerMatchStatusOne(db, toTagRule(row)) },
          };
        } catch (err) {
          translateTagRuleError(err, params.id);
        }
      }),

    update: ({ params, body }: Req['update']) =>
      runHttp(() => {
        try {
          const row = transactionTagRulesService.updateTransactionTagRule(db, params.id, body);
          return {
            status: 200 as const,
            body: { data: toTagRule(row), message: 'Tag rule updated' },
          };
        } catch (err) {
          translateTagRuleError(err, params.id);
        }
      }),

    disable: ({ params }: Req['disable']) =>
      runHttp(() => {
        try {
          transactionTagRulesService.disableTransactionTagRule(db, params.id);
          return { status: 200 as const, body: { message: 'Tag rule disabled' } };
        } catch (err) {
          translateTagRuleError(err, params.id);
        }
      }),

    delete: ({ params }: Req['delete']) =>
      runHttp(() => {
        try {
          transactionTagRulesService.deleteTransactionTagRule(db, params.id);
          return { status: 200 as const, body: { message: 'Tag rule deleted' } };
        } catch (err) {
          translateTagRuleError(err, params.id);
        }
      }),

    applyExisting: ({ params, body }: Req['applyExisting']) =>
      runHttp(() => {
        try {
          const data = applyTagRuleToExistingTransactions(db, params.id, {
            dryRun: body.dryRun,
          });
          return { status: 200 as const, body: { data } };
        } catch (err) {
          translateTagRuleError(err, params.id);
        }
      }),

    propose: ({ body }: Req['propose']) =>
      runHttp(() => ({
        status: 200 as const,
        body: proposeTagRuleChangeSet(db, {
          signal: body.signal,
          transactions: body.transactions,
          maxPreviewItems: body.maxPreviewItems,
        }),
      })),

    preview: ({ body }: Req['preview']) =>
      runHttp(() => ({
        status: 200 as const,
        body: previewTagRuleChangeSet(db, {
          changeSet: body.changeSet,
          transactions: body.transactions,
          maxPreviewItems: body.maxPreviewItems,
        }),
      })),

    apply: ({ body }: Req['apply']) =>
      runHttp(() => {
        try {
          for (const tag of body.acceptedNewTags) {
            if (tag.trim()) tagVocabularyService.upsertVocabularyTag(db, tag.trim(), 'user');
          }
          const { rules } = applyTagRuleChangeSet(db, body.changeSet);
          return { status: 200 as const, body: { rules } };
        } catch (err) {
          translateTagRuleError(err);
        }
      }),

    reject: ({ body }: Req['reject']) =>
      runHttp(() => {
        recordTagRuleRejection(db, { changeSet: body.changeSet, feedback: body.feedback });
        return { status: 200 as const, body: { message: 'Rejection recorded' } };
      }),
  };
}
