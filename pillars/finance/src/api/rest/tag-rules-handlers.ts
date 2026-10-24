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
} from '../../db/index.js';
import { TAG_FACETS } from '../../db/tag-facets.js';
import { runEntityHttp } from '../contacts/identity-snapshot.js';
import { type ContactsClient } from '../contacts/types.js';
import { filterTagRuleChangeSetEntry } from '../modules/imports/commit-tag-vocabulary.js';
import {
  previewTagRuleChangeSet,
  previewTagRuleChangeSetFullHistory,
} from '../modules/tag-rules/preview.js';
import { applyTagRuleToExistingTransactions } from '../modules/tag-rules/retroactive-apply.js';
import {
  applyTagRuleChangeSet,
  proposeTagRuleChangeSet,
  recordTagRuleRejection,
  toTagRule,
} from '../modules/tag-rules/service.js';
import { assertKnownClosedTagValues } from '../shared/closed-tag-validation.js';
import { paginationMeta } from '../shared/pagination.js';
import {
  CHANGESET_FULL_HISTORY_DEFAULT_LIMIT,
  CHANGESET_FULL_HISTORY_HARD_LIMIT,
} from './corrections-handlers-support.js';
import { runHttp } from './error-mapping.js';
import { makeTagRuleCollisionHandlers } from './tag-rules-collision-handlers.js';
import {
  translateTagRuleError,
  updateTagRuleWithIdentity,
  withLedgerMatchStatus,
  withLedgerMatchStatusOne,
} from './tag-rules-handlers-support.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeTagRulesContract } from '../../contract/rest-tag-rules.js';

type Req = ServerInferRequest<typeof financeTagRulesContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;
const MATCH_PREVIEW_DEFAULT_LIMIT = 100;
const MATCH_PREVIEW_HARD_LIMIT = 500;

export function makeTagRulesHandlers(db: FinanceDb, contacts: ContactsClient) {
  return {
    list: ({ query }: Req['list']) =>
      runEntityHttp(db, contacts, undefined, (identities) => {
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
            data: withLedgerMatchStatus(db, rows.map(toTagRule), identities),
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
      runEntityHttp(db, contacts, undefined, (identities) => {
        try {
          const row = transactionTagRulesService.getTransactionTagRule(db, params.id);
          return {
            status: 200 as const,
            body: { data: withLedgerMatchStatusOne(db, toTagRule(row), identities) },
          };
        } catch (err) {
          translateTagRuleError(err, params.id);
        }
      }),

    update: ({ params, body }: Req['update']) =>
      runEntityHttp(db, contacts, body, (identities) => ({
        status: 200 as const,
        body: {
          data: updateTagRuleWithIdentity(db, params.id, body, identities),
          message: 'Tag rule updated',
        },
      })),

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
      runEntityHttp(db, contacts, body, (identities) => {
        try {
          const data = applyTagRuleToExistingTransactions(db, params.id, {
            dryRun: body.dryRun,
            identities,
          });
          return { status: 200 as const, body: { data } };
        } catch (err) {
          translateTagRuleError(err, params.id);
        }
      }),

    propose: ({ body }: Req['propose']) =>
      runEntityHttp(db, contacts, body, (identities) => ({
        status: 200 as const,
        body: proposeTagRuleChangeSet(db, {
          signal: body.signal,
          identities,
          transactions: body.transactions,
          maxPreviewItems: body.maxPreviewItems,
        }),
      })),

    preview: ({ body }: Req['preview']) =>
      runEntityHttp(db, contacts, body, (identities) => {
        if (body.fullHistory) {
          const limit = Math.min(
            body.limit ?? CHANGESET_FULL_HISTORY_DEFAULT_LIMIT,
            CHANGESET_FULL_HISTORY_HARD_LIMIT
          );
          return {
            status: 200 as const,
            body: previewTagRuleChangeSetFullHistory(db, {
              changeSet: body.changeSet,
              identities,
              limit,
              offset: body.offset ?? DEFAULT_OFFSET,
            }),
          };
        }
        return {
          status: 200 as const,
          body: previewTagRuleChangeSet(db, {
            changeSet: body.changeSet,
            identities,
            transactions: body.transactions,
            maxPreviewItems: body.maxPreviewItems,
          }),
        };
      }),

    apply: ({ body }: Req['apply']) =>
      runEntityHttp(db, contacts, body, (identities) => {
        try {
          const known = tagVocabularyService.loadKnownTagSet(db);
          assertKnownClosedTagValues(body.acceptedNewTags, known);
          const filtered = filterTagRuleChangeSetEntry(known, {
            changeSet: body.changeSet,
            acceptedNewTags: body.acceptedNewTags,
          });
          const changeSet = filtered?.changeSet ?? { ...body.changeSet, ops: [] };
          const { rules } = applyTagRuleChangeSet(db, changeSet, identities);
          // After the apply, so a ChangeSet the write guards refuse leaves no vocabulary row behind.
          for (const tag of body.acceptedNewTags) {
            if (tag.trim()) tagVocabularyService.upsertVocabularyTag(db, tag.trim(), 'user');
          }
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

    ...makeTagRuleCollisionHandlers(db, contacts),
  };
}
