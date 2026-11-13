import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { uploadStore } from '../../db/schema.js';
import { uploadFixture } from './__tests__/fixture.js';
import { DispatchGuard, provisionDispatchGuard } from './dispatch-guard.js';
import { DurableUploads } from './service.js';

function boundService(
  fixture: Awaited<ReturnType<typeof uploadFixture>>,
  directory: string,
  guardId: string
): DurableUploads {
  return new DurableUploads(
    fixture.database.db,
    join(fixture.directory, 'spool'),
    new DispatchGuard(fixture.database.db, directory, guardId, fixture.directory),
    () => fixture.client
  );
}

it('quarantines a restored ledger when a fresh provisioned marker matches the new configured UUID but not its persisted binding', async () => {
  const fixture = await uploadFixture();
  try {
    await fixture.admit();
    const directory = join(fixture.directory, '..', 'fresh-authority');
    const guardId = randomUUID();
    provisionDispatchGuard(directory, guardId);
    for (let restart = 0; restart < 2; restart += 1) {
      fixture.reopen();
      const service = boundService(fixture, directory, guardId);
      await expect(service.dispatch(fixture.input.operationId)).rejects.toThrow();
      expect(await service.get(fixture.input.operationId)).toMatchObject({
        input: fixture.input,
        state: 'outcome_unknown',
        blockedBy: 'guard_unavailable',
        taskId: null,
        documentId: null,
        contentAvailable: true,
      });
      expect(fixture.database.db.select().from(uploadStore).get()?.guardId).toBe(fixture.guardId);
      expect(fixture.posts).toBe(0);
    }
  } finally {
    await fixture.close();
  }
});

it('never binds a nonempty ledger whose persisted singleton binding is missing, including after reopen', async () => {
  const fixture = await uploadFixture();
  try {
    await fixture.admit();
    fixture.database.db.delete(uploadStore).run();
    for (let restart = 0; restart < 2; restart += 1) {
      fixture.reopen();
      const service = boundService(fixture, fixture.guardDirectory, fixture.guardId);
      await expect(service.dispatch(fixture.input.operationId)).rejects.toThrow();
      expect(() => service.create({ ...fixture.input, operationId: randomUUID() })).toThrow();
      expect(await service.get(fixture.input.operationId)).toMatchObject({
        input: fixture.input,
        state: 'outcome_unknown',
        blockedBy: 'guard_unavailable',
      });
      expect(fixture.database.db.select().from(uploadStore).get()).toBeUndefined();
      expect(fixture.posts).toBe(0);
    }
  } finally {
    await fixture.close();
  }
});
