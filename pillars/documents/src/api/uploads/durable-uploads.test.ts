import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { UploadInputSchema } from '../../contract/upload-schemas.js';
import { PaperlessClient } from '../modules/paperless/client.js';
import { uploadFixture } from './__tests__/fixture.js';
import { chunks } from './__tests__/streams.js';
import { UploadLedger } from './ledger.js';

describe('durable upload admission and irreversible dispatch', () => {
  it('keeps identical intent/content across DB reopen and rejects every changed immutable field', async () => {
    const fixture = await uploadFixture();
    try {
      await fixture.admit();
      fixture.reopen();
      expect(fixture.service.create(fixture.input).state).toBe('admitted');
      for (const changed of [
        { fileName: 'other.pdf' },
        { title: 'other' },
        { mimeType: 'text/plain' },
        { byteLength: fixture.input.byteLength + 1 },
        { sha256: 'f'.repeat(64) },
      ]) {
        expect(() => fixture.service.create({ ...fixture.input, ...changed })).toThrow();
      }
      expect(
        await readFile(join(fixture.directory, 'spool', `${fixture.input.operationId}.blob`))
      ).toEqual(fixture.bytes);
      expect(fixture.posts).toBe(0);
    } finally {
      await fixture.close();
    }
  });

  it.each(['short', 'long', 'wrong_digest', 'interrupted'] as const)(
    'never admits or dispatches %s bytes',
    async (kind) => {
      const fixture = await uploadFixture();
      try {
        fixture.service.create(fixture.input);
        async function* bytes() {
          if (kind === 'interrupted') {
            yield fixture.bytes.subarray(0, 2);
            throw new Error('Disconnected');
          }
          if (kind === 'short') {
            yield fixture.bytes.subarray(1);
          } else if (kind === 'long') {
            yield Buffer.concat([fixture.bytes, Buffer.from('x')]);
          } else {
            yield Buffer.alloc(fixture.bytes.byteLength);
          }
        }
        await expect(
          fixture.service.content(fixture.input.operationId, fixture.input.mimeType, bytes())
        ).rejects.toThrow();
        await expect(fixture.service.dispatch(fixture.input.operationId)).rejects.toThrow();
        expect((await fixture.service.get(fixture.input.operationId)).state).toBe(
          'awaiting_content'
        );
        expect(fixture.posts).toBe(0);
        expect(await readdir(join(fixture.directory, 'spool'))).toEqual([]);
        expect(
          (
            await fixture.service.content(
              fixture.input.operationId,
              fixture.input.mimeType,
              chunks(fixture.bytes)
            )
          ).state
        ).toBe('admitted');
      } finally {
        await fixture.close();
      }
    }
  );

  it('serializes concurrent content and dispatch attempts without overwriting or posting twice', async () => {
    const fixture = await uploadFixture();
    try {
      fixture.service.create(fixture.input);
      await Promise.all([
        fixture.service.content(
          fixture.input.operationId,
          fixture.input.mimeType,
          chunks(fixture.bytes)
        ),
        fixture.service.content(
          fixture.input.operationId,
          fixture.input.mimeType,
          chunks(fixture.bytes)
        ),
      ]);
      await Promise.all([
        fixture.service.dispatch(fixture.input.operationId),
        fixture.service.dispatch(fixture.input.operationId),
      ]);
      expect(fixture.posts).toBe(1);
      const proof = await fixture.service.get(fixture.input.operationId);
      expect(proof).toMatchObject({ state: 'accepted', taskId: 'task-proof-1', documentId: null });
      fixture.reopen();
      expect(await fixture.service.dispatch(fixture.input.operationId)).toMatchObject({
        state: 'accepted',
        taskId: 'task-proof-1',
      });
      expect(fixture.posts).toBe(1);
    } finally {
      await fixture.close();
    }
  });

  it.each(['lost', 'malformed', 'redirect'] as const)(
    'retains %s outcome after restart and never blindly rePOSTs',
    async (mode) => {
      const fixture = await uploadFixture();
      try {
        await fixture.admit();
        fixture.setMode(mode);
        expect(await fixture.service.dispatch(fixture.input.operationId)).toMatchObject({
          state: 'outcome_unknown',
          taskId: null,
          documentId: null,
          contentAvailable: true,
        });
        fixture.reopen();
        fixture.setMode('accepted');
        expect(await fixture.service.dispatch(fixture.input.operationId)).toMatchObject({
          state: 'outcome_unknown',
          taskId: null,
        });
        expect((await fixture.service.get(fixture.input.operationId)).state).toBe(
          'outcome_unknown'
        );
        expect(fixture.posts).toBe(1);
      } finally {
        await fixture.close();
      }
    }
  );

  it('a durable claim without a send is conservatively unknown after reopening, not safe to send', async () => {
    const fixture = await uploadFixture();
    try {
      await fixture.admit();
      const ledger = new UploadLedger(fixture.database.db);
      expect(ledger.claim(fixture.input.operationId)).toEqual(expect.any(String));
      fixture.reopen();
      expect((await fixture.service.dispatch(fixture.input.operationId)).state).toBe(
        'outcome_unknown'
      );
      expect(fixture.posts).toBe(0);
    } finally {
      await fixture.close();
    }
  });

  it('a response cannot borrow another claim or erase a known ACK with a late failure', async () => {
    const fixture = await uploadFixture();
    try {
      await fixture.admit();
      const ledger = new UploadLedger(fixture.database.db);
      const claim = ledger.claim(fixture.input.operationId);
      if (claim === undefined) throw new Error('Fixture did not acquire a claim');
      expect(ledger.accepted(fixture.input.operationId, randomUUID(), 'wrong-task').state).toBe(
        'dispatching'
      );
      expect(ledger.accepted(fixture.input.operationId, claim, 'task-proof-1').state).toBe(
        'accepted'
      );
      expect(ledger.unknown(fixture.input.operationId, claim).taskId).toBe('task-proof-1');
      expect((await fixture.service.dispatch(fixture.input.operationId)).state).toBe('accepted');
      expect(fixture.posts).toBe(0);
    } finally {
      await fixture.close();
    }
  });

  it('uses the actual owner MIME families and no invented minimum byte count', async () => {
    const fixture = await uploadFixture();
    try {
      for (const mimeType of ['image/png', 'text/plain']) {
        expect(
          fixture.service.create({ ...fixture.input, operationId: randomUUID(), mimeType }).state
        ).toBe('awaiting_content');
      }
      const empty = {
        ...fixture.input,
        operationId: randomUUID(),
        byteLength: 0,
        sha256: createHash('sha256').digest('hex'),
      };
      fixture.service.create(empty);
      expect(
        (await fixture.service.content(empty.operationId, empty.mimeType, chunks())).state
      ).toBe('admitted');
      expect(fixture.posts).toBe(0);
    } finally {
      await fixture.close();
    }
  });

  it.each(['done', 'duplicate'] as const)(
    'retains %s original proof after upstream task expiry/reopen and releases only the spool',
    async (state) => {
      const fixture = await uploadFixture();
      try {
        await fixture.admit();
        await fixture.service.dispatch(fixture.input.operationId);
        fixture.setTask(state);
        const proof = await fixture.service.get(fixture.input.operationId);
        expect(proof).toMatchObject({
          state,
          documentId: state === 'done' ? 91 : 92,
          taskId: 'task-proof-1',
          contentAvailable: false,
        });
        expect(await readdir(join(fixture.directory, 'spool'))).toEqual([]);
        fixture.reopen();
        fixture.setTask('missing');
        expect(await fixture.service.get(fixture.input.operationId)).toEqual(proof);
        expect(fixture.posts).toBe(1);
      } finally {
        await fixture.close();
      }
    }
  );

  it('never loses accepted proof or bytes when its task is missing, unavailable or failed', async () => {
    const fixture = await uploadFixture();
    try {
      await fixture.admit();
      await fixture.service.dispatch(fixture.input.operationId);
      for (const status of ['missing', 'unavailable'] as const) {
        fixture.setTask(status);
        expect(await fixture.service.get(fixture.input.operationId)).toMatchObject({
          state: 'accepted',
          taskId: 'task-proof-1',
          contentAvailable: true,
        });
      }
      fixture.setTask('failed');
      expect(await fixture.service.get(fixture.input.operationId)).toMatchObject({
        state: 'failed',
        contentAvailable: true,
        documentId: null,
      });
      fixture.reopen();
      expect((await fixture.service.dispatch(fixture.input.operationId)).state).toBe('failed');
      expect(fixture.posts).toBe(1);
    } finally {
      await fixture.close();
    }
  });

  it('keeps old proof across changed/unconfigured owner without new requests and restores same-owner dispatch only for unclaimed work', async () => {
    const fixture = await uploadFixture();
    try {
      await fixture.admit();
      fixture.setOwner(new PaperlessClient('http://127.0.0.1:1/other-owner', 'fixture-only'));
      expect(fixture.service.create(fixture.input)).toMatchObject({
        state: 'admitted',
        ownerMatches: false,
      });
      await expect(fixture.service.dispatch(fixture.input.operationId)).rejects.toThrow();
      fixture.setOwner(null);
      expect((await fixture.service.get(fixture.input.operationId)).ownerMatches).toBe(false);
      expect(fixture.service.create(fixture.input).state).toBe('admitted');
      fixture.setOwner(fixture.client);
      await fixture.service.dispatch(fixture.input.operationId);
      const reads = fixture.taskReads;
      fixture.setOwner(null);
      expect(await fixture.service.get(fixture.input.operationId)).toMatchObject({
        state: 'accepted',
        taskId: 'task-proof-1',
        ownerMatches: false,
      });
      expect(fixture.taskReads).toBe(reads);
      expect(fixture.posts).toBe(1);
    } finally {
      await fixture.close();
    }
  });

  it('settles a late actual owner ACK into its original claim despite a changed current owner', async () => {
    const fixture = await uploadFixture();
    try {
      await fixture.admit();
      fixture.setMode('held');
      const dispatch = fixture.service.dispatch(fixture.input.operationId);
      const response = await fixture.waitHeld();
      fixture.setOwner(new PaperlessClient('http://127.0.0.1:1/other-owner', 'fixture-only'));
      expect((await fixture.service.get(fixture.input.operationId)).state).toBe('outcome_unknown');
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify('task-proof-1'));
      expect(await dispatch).toMatchObject({
        state: 'accepted',
        taskId: 'task-proof-1',
        ownerMatches: false,
      });
      fixture.reopen();
      expect(await fixture.service.dispatch(fixture.input.operationId)).toMatchObject({
        state: 'accepted',
        taskId: 'task-proof-1',
        ownerMatches: false,
      });
      expect(fixture.posts).toBe(1);
    } finally {
      await fixture.close();
    }
  });

  it.each([
    '../original.pdf',
    'directory/original.pdf',
    'directory\\original.pdf',
    '..',
    '.',
    '\u0000x',
  ])('rejects path/control filename %j', (fileName) => {
    expect(
      UploadInputSchema.safeParse({
        operationId: randomUUID(),
        fileName,
        mimeType: 'application/pdf',
        byteLength: 1,
        sha256: 'a'.repeat(64),
      }).success
    ).toBe(false);
  });
});
