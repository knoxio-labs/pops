import { randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { uploadFixture } from './__tests__/fixture.js';
import { DispatchGuard, provisionDispatchGuard } from './dispatch-guard.js';

describe('separately retained dispatch history', () => {
  it('restores only unknown original input when SQLite predates the intent and rejects changed UUID reuse', async () => {
    const fixture = await uploadFixture();
    try {
      const snapshot = join(fixture.directory, '..', 'before-intent');
      await mkdir(join(snapshot, 'spool'), { recursive: true });
      await fixture.database.raw.backup(join(snapshot, 'documents.db'));
      await fixture.admit();
      await fixture.service.dispatch(fixture.input.operationId);
      await fixture.restore(snapshot);
      expect(() => fixture.service.create({ ...fixture.input, title: 'Changed input' })).toThrow();
      expect(await fixture.service.get(fixture.input.operationId)).toMatchObject({
        input: fixture.input,
        state: 'outcome_unknown',
        taskId: null,
        documentId: null,
      });
      expect((await fixture.service.dispatch(fixture.input.operationId)).state).toBe(
        'outcome_unknown'
      );
      expect(fixture.posts).toBe(1);
    } finally {
      await fixture.close();
    }
  });

  it('quarantines stale SQLite and spool restored from before a real POST without sending again', async () => {
    const fixture = await uploadFixture();
    try {
      await fixture.admit();
      const snapshot = join(fixture.directory, '..', 'snapshot');
      await mkdir(snapshot);
      await fixture.database.raw.backup(join(snapshot, 'documents.db'));
      await cp(join(fixture.directory, 'spool'), join(snapshot, 'spool'), { recursive: true });
      expect((await fixture.service.dispatch(fixture.input.operationId)).state).toBe('accepted');
      expect(fixture.posts).toBe(1);
      await fixture.restore(snapshot);
      expect(await fixture.service.get(fixture.input.operationId)).toMatchObject({
        state: 'outcome_unknown',
        blockedBy: 'restored_history',
        taskId: null,
        contentAvailable: true,
      });
      expect((await fixture.service.dispatch(fixture.input.operationId)).state).toBe(
        'outcome_unknown'
      );
      fixture.reopen();
      expect(fixture.service.create(fixture.input).state).toBe('outcome_unknown');
      expect(fixture.posts).toBe(1);
    } finally {
      await fixture.close();
    }
  });

  it('preserves usable legitimately unsent work through an ordinary producer restart', async () => {
    const fixture = await uploadFixture();
    try {
      await fixture.admit();
      fixture.reopen();
      expect((await fixture.service.get(fixture.input.operationId)).state).toBe('admitted');
      expect((await fixture.service.dispatch(fixture.input.operationId)).state).toBe('accepted');
      expect(fixture.posts).toBe(1);
    } finally {
      await fixture.close();
    }
  });

  it.each(['missing', 'corrupt', 'different'] as const)(
    'refuses dispatch with a %s marker but retains readable input/proof',
    async (kind) => {
      const fixture = await uploadFixture();
      try {
        await fixture.admit();
        const marker = join(fixture.guardDirectory, 'binding.json');
        if (kind === 'missing') await rm(marker);
        else
          await writeFile(
            marker,
            kind === 'corrupt' ? '{invalid' : JSON.stringify({ version: 1, guardId: randomUUID() })
          );
        expect(await fixture.service.get(fixture.input.operationId)).toMatchObject({
          input: fixture.input,
          state: 'outcome_unknown',
          blockedBy: 'guard_unavailable',
        });
        await expect(fixture.service.dispatch(fixture.input.operationId)).rejects.toThrow();
        fixture.reopen();
        expect((await fixture.service.get(fixture.input.operationId)).state).toBe(
          'outcome_unknown'
        );
        expect(fixture.posts).toBe(0);
      } finally {
        await fixture.close();
      }
    }
  );

  it('never overwrites a guard marker or an existing dispatch tombstone, including corrupt history', async () => {
    const fixture = await uploadFixture();
    try {
      await fixture.admit();
      const marker = await readFile(join(fixture.guardDirectory, 'binding.json'));
      expect(() => provisionDispatchGuard(fixture.guardDirectory, randomUUID())).toThrow();
      expect(await readFile(join(fixture.guardDirectory, 'binding.json'))).toEqual(marker);
      await writeFile(
        join(fixture.guardDirectory, `${fixture.input.operationId}.claim`),
        'partial tombstone'
      );
      expect(await fixture.service.dispatch(fixture.input.operationId)).toMatchObject({
        state: 'outcome_unknown',
        blockedBy: 'guard_unavailable',
      });
      expect(
        await readFile(join(fixture.guardDirectory, `${fixture.input.operationId}.claim`), 'utf8')
      ).toBe('partial tombstone');
      expect(fixture.posts).toBe(0);
    } finally {
      await fixture.close();
    }
  });

  it('refuses a guard directory inside the restored data volume', async () => {
    const fixture = await uploadFixture();
    try {
      const directory = join(fixture.directory, 'unsafe-guard');
      provisionDispatchGuard(directory, fixture.guardId);
      expect(
        new DispatchGuard(
          fixture.database.db,
          directory,
          fixture.guardId,
          fixture.directory
        ).available()
      ).toBe(false);
    } finally {
      await fixture.close();
    }
  });
});
