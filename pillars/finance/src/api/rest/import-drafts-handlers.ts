/**
 * Handlers for the `importDrafts.*` sub-router (POPS-3329, finance ADR-005).
 *
 * Two 409s, told apart by `code`. `DraftOwnedElsewhere` is the lease
 * refusing a write, heartbeat or unforced claim from a tab that does not
 * hold it, and carries when the holder was last seen so the client can say
 * "open in another tab" or "left open". `DraftUnusable` is a full read of a
 * draft the card already lists as unusable; the list keeps serving it so
 * the card can offer Discard, the read refuses so no wizard mounts on it.
 */
import {
  accountsService,
  AccountNotFoundError,
  DraftOwnedElsewhereError,
  ImportDraftNotFoundError,
  importDraftsService,
  type AccountRow,
  type FinanceDb,
} from '../../db/index.js';
import { toImportDraft, toImportDraftSummary } from '../modules/import-drafts-types.js';
import { HttpError, NotFoundError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';
import { requireAccount } from './require-account.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeImportDraftsContract } from '../../contract/rest-import-drafts.js';
import type { ImportDraftRow } from '../../db/services/import-drafts.js';

type Req = ServerInferRequest<typeof financeImportDraftsContract>;

export class DraftOwnedElsewhereHttpError extends HttpError {
  constructor(cause: DraftOwnedElsewhereError) {
    super(
      409,
      cause.message,
      { ownerSeenAt: cause.ownerSeenAt },
      'finance.importDrafts.ownedElsewhere'
    );
    this.name = 'DraftOwnedElsewhere';
  }
}

export class DraftUnusableHttpError extends HttpError {
  constructor(reason: string) {
    super(409, reason, undefined, 'finance.importDrafts.unusable');
    this.name = 'DraftUnusable';
  }
}

function accountOf(db: FinanceDb, row: ImportDraftRow): AccountRow | undefined {
  try {
    return accountsService.getAccount(db, row.accountId);
  } catch (err) {
    if (err instanceof AccountNotFoundError) return undefined;
    throw err;
  }
}

function requireDraft(db: FinanceDb, id: string): { row: ImportDraftRow; account: AccountRow } {
  const row = importDraftsService.getImportDraft(db, id);
  const account = row === undefined ? undefined : accountOf(db, row);
  if (row === undefined || account === undefined) throw new NotFoundError('Import draft', id);
  return { row, account };
}

function leased<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof DraftOwnedElsewhereError) throw new DraftOwnedElsewhereHttpError(err);
    if (err instanceof ImportDraftNotFoundError)
      throw new NotFoundError('Import draft', err.draftId);
    throw err;
  }
}

function spanColumns(span: { from: string; to: string } | null) {
  return { dateFrom: span?.from ?? null, dateTo: span?.to ?? null };
}

export function makeImportDraftsHandlers(db: FinanceDb, clock: () => Date = () => new Date()) {
  const summary = (row: ImportDraftRow, account: AccountRow) =>
    toImportDraftSummary(row, account, clock());

  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => {
        const now = clock();
        const rows = importDraftsService.listImportDrafts(db, {
          accountId: query.account,
          state: query.state,
        });
        const data = rows.flatMap((row) => {
          const account = accountOf(db, row);
          return account === undefined ? [] : [toImportDraftSummary(row, account, now)];
        });
        return { status: 200 as const, body: { data } };
      }),

    get: ({ params }: Req['get']) =>
      runHttp(() => {
        const { row, account } = requireDraft(db, params.id);
        const draft = toImportDraft(row, account, clock());
        if (draft.state === 'unusable') {
          throw new DraftUnusableHttpError(draft.unusableReason ?? 'Cannot be resumed.');
        }
        return { status: 200 as const, body: { data: draft } };
      }),

    create: ({ body }: Req['create']) =>
      runHttp(() => {
        const account = requireAccount(db, body.accountId);
        const now = clock();
        const created = importDraftsService.createImportDraft(
          db,
          {
            accountId: body.accountId,
            sourceKind: 'file',
            state: 'saved',
            dialectId: body.dialectId,
            sourceFileNames: body.fileNames,
            step: body.step,
            payload: JSON.stringify(body.payload),
            rowCount: body.rowCount,
            unresolvedCount: body.unresolvedCount,
            ...spanColumns(body.span),
            processSessionId: body.processSessionId ?? null,
          },
          now
        );
        const claimed = importDraftsService.claimImportDraft(db, created.id, body.ownerToken, {
          now,
        });
        return { status: 201 as const, body: { data: summary(claimed, account) } };
      }),

    write: ({ params, body }: Req['write']) =>
      runHttp(() => {
        const { account } = requireDraft(db, params.id);
        const written = leased(() =>
          importDraftsService.writeImportDraft(
            db,
            params.id,
            {
              payload: JSON.stringify(body.payload),
              step: body.step,
              rowCount: body.rowCount,
              unresolvedCount: body.unresolvedCount,
              ...spanColumns(body.span),
              processSessionId: body.processSessionId,
            },
            { ownerToken: body.ownerToken, now: clock() }
          )
        );
        return { status: 200 as const, body: { data: summary(written, account) } };
      }),

    claim: ({ params, body }: Req['claim']) =>
      runHttp(() => {
        const { account } = requireDraft(db, params.id);
        const claimed = leased(() =>
          importDraftsService.claimImportDraft(db, params.id, body.ownerToken, {
            force: body.force ?? false,
            now: clock(),
          })
        );
        return { status: 200 as const, body: { data: summary(claimed, account) } };
      }),

    heartbeat: ({ params, body }: Req['heartbeat']) =>
      runHttp(() => {
        const { account } = requireDraft(db, params.id);
        const seen = leased(() =>
          importDraftsService.heartbeatImportDraft(db, params.id, body.ownerToken, clock())
        );
        return { status: 200 as const, body: { data: summary(seen, account) } };
      }),

    release: ({ params, body }: Req['release']) =>
      runHttp(() => {
        requireDraft(db, params.id);
        importDraftsService.releaseImportDraft(db, params.id, body.ownerToken);
        return { status: 204 as const, body: undefined };
      }),

    discard: ({ params }: Req['discard']) =>
      runHttp(() => {
        if (!importDraftsService.discardImportDraft(db, params.id)) {
          throw new NotFoundError('Import draft', params.id);
        }
        return { status: 204 as const, body: undefined };
      }),
  };
}
