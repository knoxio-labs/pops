/**
 * Invariant tests for the import-drafts service (POPS-3328, finance ADR-005):
 * one live draft per account, claiming turns it saved, the lease refuses
 * strangers and replaces the silent, and discard is the only delete.
 */
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { IMPORT_DRAFT_SHAPE_VERSION } from '../../contract/import-draft.js';
import { DraftOwnedElsewhereError, ImportDraftNotFoundError } from '../errors.js';
import { accounts } from '../schema.js';
import { createAccount } from '../services/accounts.js';
import {
  claimImportDraft,
  createImportDraft,
  discardImportDraft,
  fileNamesOf,
  getImportDraft,
  heartbeatImportDraft,
  listImportDrafts,
  liveDraftFor,
  releaseImportDraft,
  writeImportDraft,
} from '../services/import-drafts.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

import type { CreateImportDraftInput } from '../services/import-drafts.js';
import type { FinanceDb } from '../services/internal.js';

let db: FinanceDb;
let accountId: string;

const T0 = new Date('2026-09-10T09:00:00Z');
const later = (ms: number) => new Date(T0.getTime() + ms);
const HOUR = 60 * 60 * 1000;

function fileDraft(overrides: Partial<CreateImportDraftInput> = {}): CreateImportDraftInput {
  return {
    accountId,
    sourceKind: 'file',
    state: 'saved',
    dialectId: 'amex',
    sourceFileNames: ['activity_2026-08.csv'],
    step: 4,
    payload: JSON.stringify({ currentStep: 4 }),
    rowCount: 46,
    unresolvedCount: 3,
    dateFrom: '2026-08-01',
    dateTo: '2026-08-31',
    ...overrides,
  };
}

function liveDraft(overrides: Partial<CreateImportDraftInput> = {}): CreateImportDraftInput {
  return {
    accountId,
    sourceKind: 'live',
    state: 'live',
    provider: 'up',
    payload: JSON.stringify({ rows: [] }),
    rowCount: 11,
    unresolvedCount: 2,
    dateFrom: '2026-09-02',
    dateTo: '2026-09-10',
    balanceReportedCents: 61_215,
    ...overrides,
  };
}

beforeEach(() => {
  db = freshMigratedFinanceDb().db;
  accountId = createAccount(db, { name: 'Draft Test Card', kind: 'checking', currency: 'AUD' }).id;
});

describe('createImportDraft / getImportDraft', () => {
  it('round-trips every field and stamps the running shape version', () => {
    const created = createImportDraft(db, fileDraft(), T0);
    const read = getImportDraft(db, created.id);
    expect(read).toEqual(created);
    expect(read).toMatchObject({
      accountId,
      sourceKind: 'file',
      state: 'saved',
      dialectId: 'amex',
      step: 4,
      shapeVersion: IMPORT_DRAFT_SHAPE_VERSION,
      rowCount: 46,
      unresolvedCount: 3,
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
      balanceReportedCents: null,
      ownerToken: null,
      ownerSeenAt: null,
      savedAt: T0.toISOString(),
    });
    expect(fileNamesOf(read!)).toEqual(['activity_2026-08.csv']);
  });

  it('stores no file names for a live draft and reads them back as none', () => {
    const created = createImportDraft(db, liveDraft());
    expect(created.sourceFileNames).toBeNull();
    expect(fileNamesOf(created)).toEqual([]);
    expect(created.balanceReportedCents).toBe(61_215);
  });

  it('is gone when its account is deleted', () => {
    const created = createImportDraft(db, fileDraft());
    db.delete(accounts).where(eq(accounts.id, accountId)).run();
    expect(getImportDraft(db, created.id)).toBeUndefined();
  });

  it('refuses a second live draft for the same account', () => {
    createImportDraft(db, liveDraft());
    expect(() => createImportDraft(db, liveDraft())).toThrow(/UNIQUE/);
  });

  it('allows a live draft beside any number of saved ones', () => {
    createImportDraft(db, liveDraft());
    createImportDraft(db, fileDraft());
    createImportDraft(db, liveDraft({ state: 'saved', step: 4 }));
    expect(listImportDrafts(db, { accountId })).toHaveLength(3);
  });
});

describe('listImportDrafts', () => {
  it('filters by account and by state, newest saved first', () => {
    const other = createAccount(db, {
      name: 'Draft Test Other',
      kind: 'checking',
      currency: 'AUD',
    }).id;
    const oldSaved = createImportDraft(db, fileDraft(), later(-2 * HOUR));
    const live = createImportDraft(db, liveDraft(), later(-1 * HOUR));
    const newSaved = createImportDraft(db, fileDraft(), T0);
    const elsewhere = createImportDraft(db, fileDraft({ accountId: other }), later(HOUR));

    expect(listImportDrafts(db).map((d) => d.id)).toEqual([
      elsewhere.id,
      newSaved.id,
      live.id,
      oldSaved.id,
    ]);
    expect(listImportDrafts(db, { accountId }).map((d) => d.id)).toEqual([
      newSaved.id,
      live.id,
      oldSaved.id,
    ]);
    expect(listImportDrafts(db, { accountId, state: 'live' }).map((d) => d.id)).toEqual([live.id]);
    expect(listImportDrafts(db, { state: 'saved' })).toHaveLength(3);
  });
});

describe('liveDraftFor', () => {
  it('returns the collecting draft and nothing when there is none', () => {
    expect(liveDraftFor(db, accountId)).toBeUndefined();
    const live = createImportDraft(db, liveDraft());
    createImportDraft(db, fileDraft());
    expect(liveDraftFor(db, accountId)?.id).toBe(live.id);
  });

  it('stops returning a live draft once a person has claimed it', () => {
    const live = createImportDraft(db, liveDraft());
    claimImportDraft(db, live.id, 'tab-a', { now: T0 });
    expect(liveDraftFor(db, accountId)).toBeUndefined();
    expect(getImportDraft(db, live.id)).toMatchObject({ state: 'saved', step: 1 });
  });

  it('lets a new live draft form after the old one was claimed', () => {
    const first = createImportDraft(db, liveDraft());
    claimImportDraft(db, first.id, 'tab-a', { now: T0 });
    const next = createImportDraft(db, liveDraft({ rowCount: 4 }));
    expect(liveDraftFor(db, accountId)?.id).toBe(next.id);
  });
});

describe('writeImportDraft', () => {
  it('replaces payload, step and counts and bumps saved_at', () => {
    const created = createImportDraft(db, fileDraft(), T0);
    const written = writeImportDraft(
      db,
      created.id,
      {
        payload: JSON.stringify({ currentStep: 5 }),
        step: 5,
        rowCount: 46,
        unresolvedCount: 0,
        dateFrom: '2026-08-01',
        dateTo: '2026-08-31',
        processSessionId: 'sess-1',
      },
      { now: later(HOUR) }
    );
    expect(written).toMatchObject({
      payload: JSON.stringify({ currentStep: 5 }),
      step: 5,
      unresolvedCount: 0,
      processSessionId: 'sess-1',
      savedAt: later(HOUR).toISOString(),
    });
  });

  it('keeps step, balance and session when the write leaves them out', () => {
    const created = createImportDraft(db, liveDraft({ processSessionId: 'sess-0' }));
    const written = writeImportDraft(db, created.id, {
      payload: '{}',
      rowCount: 12,
      unresolvedCount: 3,
      dateFrom: '2026-09-02',
      dateTo: '2026-09-11',
    });
    expect(written).toMatchObject({
      step: null,
      balanceReportedCents: 61_215,
      processSessionId: 'sess-0',
      rowCount: 12,
    });
  });

  it('accepts a write from the owner and refreshes its heartbeat', () => {
    const created = createImportDraft(db, fileDraft(), T0);
    claimImportDraft(db, created.id, 'tab-a', { now: T0 });
    const written = writeImportDraft(
      db,
      created.id,
      { payload: '{}', rowCount: 1, unresolvedCount: 0, dateFrom: null, dateTo: null },
      { ownerToken: 'tab-a', now: later(HOUR) }
    );
    expect(written.ownerSeenAt).toBe(later(HOUR).toISOString());
  });

  it('refuses a write from a token that is not the owner and leaves the draft unchanged', () => {
    const created = createImportDraft(db, fileDraft(), T0);
    claimImportDraft(db, created.id, 'tab-a', { now: T0 });
    const attempt = () =>
      writeImportDraft(
        db,
        created.id,
        {
          payload: '{"stolen":true}',
          rowCount: 0,
          unresolvedCount: 0,
          dateFrom: null,
          dateTo: null,
        },
        { ownerToken: 'tab-b' }
      );
    expect(attempt).toThrow(DraftOwnedElsewhereError);
    expect(getImportDraft(db, created.id)).toMatchObject({
      payload: created.payload,
      rowCount: 46,
      ownerToken: 'tab-a',
    });
  });

  it('refuses a tokenless write against an owned draft', () => {
    const created = createImportDraft(db, fileDraft(), T0);
    claimImportDraft(db, created.id, 'tab-a', { now: T0 });
    expect(() =>
      writeImportDraft(db, created.id, {
        payload: '{}',
        rowCount: 0,
        unresolvedCount: 0,
        dateFrom: null,
        dateTo: null,
      })
    ).toThrow(DraftOwnedElsewhereError);
  });

  it('throws not-found for a draft that does not exist', () => {
    expect(() =>
      writeImportDraft(db, 'nope', {
        payload: '{}',
        rowCount: 0,
        unresolvedCount: 0,
        dateFrom: null,
        dateTo: null,
      })
    ).toThrow(ImportDraftNotFoundError);
  });
});

describe('claim / heartbeat / release', () => {
  it('claims an unowned draft and keeps its step', () => {
    const created = createImportDraft(db, fileDraft({ step: 4 }));
    const claimed = claimImportDraft(db, created.id, 'tab-a', { now: T0 });
    expect(claimed).toMatchObject({
      ownerToken: 'tab-a',
      ownerSeenAt: T0.toISOString(),
      state: 'saved',
      step: 4,
    });
  });

  it('is idempotent for the owner', () => {
    const created = createImportDraft(db, fileDraft());
    claimImportDraft(db, created.id, 'tab-a', { now: T0 });
    const again = claimImportDraft(db, created.id, 'tab-a', { now: later(HOUR) });
    expect(again.ownerSeenAt).toBe(later(HOUR).toISOString());
  });

  it('refuses a claim while another owner was seen inside the stale window', () => {
    const created = createImportDraft(db, fileDraft());
    claimImportDraft(db, created.id, 'tab-a', { now: T0 });
    let caught: unknown;
    try {
      claimImportDraft(db, created.id, 'tab-b', { now: later(23 * HOUR) });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DraftOwnedElsewhereError);
    expect((caught as DraftOwnedElsewhereError).ownerSeenAt).toBe(T0.toISOString());
    expect(getImportDraft(db, created.id)?.ownerToken).toBe('tab-a');
  });

  it('replaces an owner not seen for more than the stale window without force', () => {
    const created = createImportDraft(db, fileDraft());
    claimImportDraft(db, created.id, 'tab-a', { now: T0 });
    const taken = claimImportDraft(db, created.id, 'tab-b', { now: later(24 * HOUR + 1) });
    expect(taken.ownerToken).toBe('tab-b');
  });

  it('keeps the owner at exactly the stale window', () => {
    const created = createImportDraft(db, fileDraft());
    claimImportDraft(db, created.id, 'tab-a', { now: T0 });
    expect(() => claimImportDraft(db, created.id, 'tab-b', { now: later(24 * HOUR) })).toThrow(
      DraftOwnedElsewhereError
    );
  });

  it('replaces a live owner when forced, and the old owner then fails its heartbeat', () => {
    const created = createImportDraft(db, fileDraft());
    claimImportDraft(db, created.id, 'tab-a', { now: T0 });
    const taken = claimImportDraft(db, created.id, 'tab-b', { force: true, now: later(HOUR) });
    expect(taken.ownerToken).toBe('tab-b');
    expect(() => heartbeatImportDraft(db, created.id, 'tab-a', later(HOUR))).toThrow(
      DraftOwnedElsewhereError
    );
  });

  it('heartbeat moves owner_seen_at for the owner only', () => {
    const created = createImportDraft(db, fileDraft());
    claimImportDraft(db, created.id, 'tab-a', { now: T0 });
    const beat = heartbeatImportDraft(db, created.id, 'tab-a', later(HOUR));
    expect(beat.ownerSeenAt).toBe(later(HOUR).toISOString());
    expect(() => heartbeatImportDraft(db, created.id, 'tab-b', later(HOUR))).toThrow(
      DraftOwnedElsewhereError
    );
  });

  it('heartbeat fails once the lease was released, so a released tab cannot write on', () => {
    const created = createImportDraft(db, fileDraft());
    claimImportDraft(db, created.id, 'tab-a', { now: T0 });
    releaseImportDraft(db, created.id, 'tab-a');
    expect(() => heartbeatImportDraft(db, created.id, 'tab-a')).toThrow(DraftOwnedElsewhereError);
  });

  it('release clears the owner for the holder and is a no-op for anyone else', () => {
    const created = createImportDraft(db, fileDraft());
    claimImportDraft(db, created.id, 'tab-a', { now: T0 });
    expect(releaseImportDraft(db, created.id, 'tab-b')).toBe(false);
    expect(getImportDraft(db, created.id)?.ownerToken).toBe('tab-a');
    expect(releaseImportDraft(db, created.id, 'tab-a')).toBe(true);
    expect(getImportDraft(db, created.id)).toMatchObject({ ownerToken: null, ownerSeenAt: null });
    expect(releaseImportDraft(db, 'nope', 'tab-a')).toBe(false);
  });

  it('release keeps the draft saved: a released live draft does not collect again', () => {
    const live = createImportDraft(db, liveDraft());
    claimImportDraft(db, live.id, 'tab-a', { now: T0 });
    releaseImportDraft(db, live.id, 'tab-a');
    expect(liveDraftFor(db, accountId)).toBeUndefined();
  });

  it('claim and heartbeat throw not-found for a missing draft', () => {
    expect(() => claimImportDraft(db, 'nope', 'tab-a')).toThrow(ImportDraftNotFoundError);
    expect(() => heartbeatImportDraft(db, 'nope', 'tab-a')).toThrow(ImportDraftNotFoundError);
  });
});

describe('discardImportDraft', () => {
  it('removes the row and reports whether there was one', () => {
    const created = createImportDraft(db, fileDraft());
    expect(discardImportDraft(db, created.id)).toBe(true);
    expect(getImportDraft(db, created.id)).toBeUndefined();
    expect(discardImportDraft(db, created.id)).toBe(false);
  });

  it('frees the live slot so the account can collect again', () => {
    const live = createImportDraft(db, liveDraft());
    discardImportDraft(db, live.id);
    expect(() => createImportDraft(db, liveDraft())).not.toThrow();
  });
});
