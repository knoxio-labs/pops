import { mkdir, readdir, rename, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { uploadFixture } from './__tests__/fixture.js';
import { chunks } from './__tests__/streams.js';
import { UploadLedger } from './ledger.js';
import { UploadSpool } from './spool.js';

describe('spool inode ownership', () => {
  it('refuses an existing symlink during atomic admission even when target bytes match the requested digest', async () => {
    const fixture = await uploadFixture();
    try {
      fixture.service.create(fixture.input);
      const directory = join(fixture.directory, 'spool');
      await mkdir(directory);
      const outside = join(fixture.directory, 'outside.pdf');
      await writeFile(outside, fixture.bytes);
      await symlink(outside, join(directory, `${fixture.input.operationId}.blob`));
      await expect(
        fixture.service.content(
          fixture.input.operationId,
          fixture.input.mimeType,
          chunks(fixture.bytes)
        )
      ).rejects.toThrow();
      expect((await fixture.service.get(fixture.input.operationId)).state).toBe('awaiting_content');
      expect(fixture.posts).toBe(0);
    } finally {
      await fixture.close();
    }
  });

  it.each(['symlink', 'directory'] as const)(
    'does not POST when the admitted path is replaced with a %s',
    async (kind) => {
      const fixture = await uploadFixture();
      try {
        await fixture.admit();
        const path = join(fixture.directory, 'spool', `${fixture.input.operationId}.blob`);
        await rm(path);
        if (kind === 'directory') await mkdir(path);
        else {
          const outside = join(fixture.directory, 'outside.pdf');
          await writeFile(outside, fixture.bytes);
          await symlink(outside, path);
        }
        await expect(fixture.service.dispatch(fixture.input.operationId)).rejects.toThrow();
        expect(fixture.posts).toBe(0);
      } finally {
        await fixture.close();
      }
    }
  );

  it.each(['corruption', 'truncation', 'removal'] as const)(
    'refuses admitted regular-file %s before any claim or upstream POST, including after reopen',
    async (damage) => {
      const fixture = await uploadFixture();
      try {
        await fixture.admit();
        const path = join(fixture.directory, 'spool', `${fixture.input.operationId}.blob`);
        if (damage === 'corruption') {
          await writeFile(path, Buffer.alloc(fixture.bytes.byteLength, 'x'));
        } else if (damage === 'truncation') {
          await truncate(path, fixture.bytes.byteLength - 1);
        } else {
          await rm(path);
        }
        const failure =
          damage === 'removal'
            ? { code: 'documents.upload.storage', status: 503, retryable: true }
            : { code: 'documents.upload.invalid', status: 400, retryable: false };
        for (let attempt = 0; attempt < 2; attempt += 1) {
          if (attempt === 1) fixture.reopen();
          await expect(fixture.service.dispatch(fixture.input.operationId)).rejects.toMatchObject({
            name: 'PopsError',
            ...failure,
          });
          expect(
            new UploadLedger(fixture.database.db).get(fixture.input.operationId)
          ).toMatchObject({
            state: 'admitted',
            claim: null,
            taskId: null,
            documentId: null,
          });
          expect(await readdir(fixture.guardDirectory)).toEqual(['binding.json']);
          expect(fixture.posts).toBe(0);
          expect(fixture.postBodies).toEqual([]);
        }
      } finally {
        await fixture.close();
      }
    }
  );

  it('sends only the verified held inode when the path is swapped before the actual upstream POST', async () => {
    const fixture = await uploadFixture();
    const original = UploadSpool.prototype.openVerified;
    const observer = vi
      .spyOn(UploadSpool.prototype, 'openVerified')
      .mockImplementation(async function (this: UploadSpool, input) {
        const held = await original.call(this, input);
        const path = join(fixture.directory, 'spool', `${input.operationId}.blob`);
        await rename(path, `${path}.original`);
        const replacement = join(fixture.directory, 'foreign.pdf');
        await writeFile(replacement, 'different foreign bytes');
        await symlink(replacement, path);
        return held;
      });
    try {
      await fixture.admit();
      expect((await fixture.service.dispatch(fixture.input.operationId)).state).toBe('accepted');
      expect(fixture.posts).toBe(1);
      expect(fixture.postBodies[0]).toContain(fixture.bytes.toString());
      expect(fixture.postBodies[0]).not.toContain('different foreign bytes');
    } finally {
      observer.mockRestore();
      await fixture.close();
    }
  });
});
