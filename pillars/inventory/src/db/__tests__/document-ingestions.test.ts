/**
 * The ingestion table and its service against an in-memory SQLite brought up
 * by the real migration journal: completing a row into a link, a duplicate of
 * a pair already linked, idempotence, failure, dismissal and the item cascade.
 */
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  documentIngestionsService,
  itemDocumentIngestions,
  itemDocuments,
  items,
} from '../index.js';
import { DocumentIngestionNotFoundError } from '../services/document-ingestions.js';
import { DocumentItemNotFoundError } from '../services/documents-errors.js';
import { seedInventoryItem } from './item-fixture.js';
import { openMigratedTestDb } from './migrated-db.js';

import type { Database } from 'better-sqlite3';

import type { InventoryDb } from '../services/internal.js';

let db: InventoryDb;
let raw: Database;
let itemId: string;

beforeEach(() => {
  ({ db, raw } = openMigratedTestDb());
  itemId = seedInventoryItem(db, { name: 'Dishwasher' }).id;
});

function pending(taskId: string, title: string | null = 'Dishwasher manual') {
  return documentIngestionsService.create(db, {
    itemId,
    taskId,
    documentType: 'manual',
    title,
    fileName: 'manual.pdf',
  });
}

function links() {
  return db.select().from(itemDocuments).all();
}

function ingestions() {
  return db.select().from(itemDocumentIngestions).all();
}

describe('create', () => {
  it('records a pending row', () => {
    expect(pending('task-a')).toMatchObject({
      itemId,
      taskId: 'task-a',
      state: 'pending',
      reason: null,
    });
  });

  it('refuses an unknown item', () => {
    expect(() =>
      documentIngestionsService.create(db, {
        itemId: 'missing',
        taskId: 't',
        documentType: 'other',
        title: null,
        fileName: 'f.pdf',
      })
    ).toThrow(DocumentItemNotFoundError);
  });

  it('refuses a second row for the same task', () => {
    pending('task-a');
    expect(() => pending('task-a')).toThrow();
  });

  it('refuses a state the table does not define', () => {
    pending('task-a');
    expect(() => raw.prepare(`UPDATE item_document_ingestions SET state = 'done'`).run()).toThrow(
      /CHECK constraint/
    );
  });
});

describe('complete', () => {
  it('replaces the row with a link carrying its type and title, in one step', () => {
    const row = pending('task-a');

    expect(documentIngestionsService.complete(db, row.id, 41)).toBe('linked');

    expect(ingestions()).toEqual([]);
    expect(links()).toEqual([
      expect.objectContaining({
        itemId,
        paperlessDocumentId: 41,
        documentType: 'manual',
        title: 'Dishwasher manual',
      }),
    ]);
  });

  it('titles the link with the file name when the upload had no title', () => {
    const row = pending('task-a', null);

    documentIngestionsService.complete(db, row.id, 41);

    expect(links()[0]?.title).toBe('manual.pdf');
  });

  it('only removes the row when the item already links that document', () => {
    db.insert(itemDocuments)
      .values({ itemId, paperlessDocumentId: 41, documentType: 'receipt', title: 'Linked by hand' })
      .run();
    const row = pending('task-a');

    expect(documentIngestionsService.complete(db, row.id, 41)).toBe('already-linked');

    expect(ingestions()).toEqual([]);
    expect(links()).toEqual([
      expect.objectContaining({ paperlessDocumentId: 41, title: 'Linked by hand' }),
    ]);
  });

  it('is a no-op the second time', () => {
    const row = pending('task-a');
    documentIngestionsService.complete(db, row.id, 41);

    expect(documentIngestionsService.complete(db, row.id, 41)).toBe('gone');
    expect(links()).toHaveLength(1);
  });

  it('leaves a failed row alone', () => {
    const row = pending('task-a');
    documentIngestionsService.markFailed(db, row.id, 'corrupt');

    expect(documentIngestionsService.complete(db, row.id, 41)).toBe('gone');
    expect(links()).toEqual([]);
    expect(ingestions()).toEqual([expect.objectContaining({ state: 'failed', reason: 'corrupt' })]);
  });
});

describe('listPending', () => {
  it('lists only pending rows, for every item or one', () => {
    const other = seedInventoryItem(db, { name: 'Fridge' }).id;
    const a = pending('task-a');
    const b = pending('task-b');
    documentIngestionsService.create(db, {
      itemId: other,
      taskId: 'task-c',
      documentType: 'receipt',
      title: null,
      fileName: 'r.pdf',
    });
    documentIngestionsService.markFailed(db, b.id, 'corrupt');

    expect(documentIngestionsService.listPending(db).map((r) => r.taskId)).toEqual([
      'task-a',
      'task-c',
    ]);
    expect(documentIngestionsService.listPending(db, itemId).map((r) => r.id)).toEqual([a.id]);
  });
});

describe('dismiss', () => {
  it('removes a pending or a failed row', () => {
    const a = pending('task-a');
    const b = pending('task-b');
    documentIngestionsService.markFailed(db, b.id, 'corrupt');

    documentIngestionsService.dismiss(db, a.id);
    documentIngestionsService.dismiss(db, b.id);

    expect(ingestions()).toEqual([]);
  });

  it('throws for a row that does not exist', () => {
    expect(() => documentIngestionsService.dismiss(db, 999)).toThrow(
      DocumentIngestionNotFoundError
    );
  });
});

describe('the item cascade', () => {
  it("removes an item's ingestions when the item row is deleted", () => {
    pending('task-a');

    db.delete(items).where(eq(items.id, itemId)).run();

    expect(ingestions()).toEqual([]);
  });
});
