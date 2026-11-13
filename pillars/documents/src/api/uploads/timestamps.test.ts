import { getTableColumns } from 'drizzle-orm';
import { expect, it } from 'vitest';

import { uploads } from '../../db/schema.js';
import { uploadFixture } from './__tests__/fixture.js';
import { UploadLedger } from './ledger.js';

import type { UploadRow } from '../../db/schema.js';

function expectTimestamps(row: UploadRow): void {
  expect(typeof row.createdAt).toBe('string');
  expect(typeof row.updatedAt).toBe('string');
  expect(new Date(row.createdAt).toISOString()).toBe(row.createdAt);
  expect(new Date(row.updatedAt).toISOString()).toBe(row.updatedAt);
}

it('persists upload creation and transitions with ISO8601 TEXT timestamps', async () => {
  const fixture = await uploadFixture();
  try {
    const columns = getTableColumns(uploads);
    expect(columns.createdAt.getSQLType()).toBe('text');
    expect(columns.updatedAt.getSQLType()).toBe('text');
    expect(fixture.database.raw.prepare('PRAGMA table_info(uploads)').all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'created_at', type: 'TEXT' }),
        expect.objectContaining({ name: 'updated_at', type: 'TEXT' }),
      ])
    );
    fixture.service.create(fixture.input);
    const ledger = new UploadLedger(fixture.database.db);
    const createdAt = ledger.get(fixture.input.operationId).createdAt;
    expectTimestamps(ledger.get(fixture.input.operationId));
    await fixture.admit();
    expectTimestamps(ledger.get(fixture.input.operationId));
    await fixture.service.dispatch(fixture.input.operationId);
    expectTimestamps(ledger.get(fixture.input.operationId));
    fixture.setTask('done');
    await fixture.service.get(fixture.input.operationId);
    fixture.reopen();
    const restored = new UploadLedger(fixture.database.db).get(fixture.input.operationId);
    expectTimestamps(restored);
    expect(restored.createdAt).toBe(createdAt);
  } finally {
    await fixture.close();
  }
});
