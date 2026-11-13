import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fsyncState = vi.hoisted(() => ({
  armedFailure: undefined as 'file' | 'directory' | undefined,
  events: [] as Array<'file-fsync' | 'directory-fsync' | 'ledger-claim'>,
  recording: false,
}));

vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>();
  return {
    ...original,
    fsyncSync: (descriptor: number) => {
      const stats = original.fstatSync(descriptor);
      let kind: 'file' | 'directory' | undefined;
      if (stats.isFile()) kind = 'file';
      else if (stats.isDirectory()) kind = 'directory';
      if (fsyncState.recording && kind !== undefined) {
        fsyncState.events.push(`${kind}-fsync`);
        if (
          fsyncState.armedFailure === kind &&
          (kind === 'file' || fsyncState.events.includes('file-fsync'))
        ) {
          fsyncState.armedFailure = undefined;
          original.fsyncSync(descriptor);
          throw new Error(`Injected ${kind} fsync failure`);
        }
      }
      original.fsyncSync(descriptor);
    },
  };
});

import { uploadFixture } from './__tests__/fixture.js';
import { UploadLedger } from './ledger.js';

describe('dispatch guard durability ordering', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    fsyncState.armedFailure = undefined;
    fsyncState.events = [];
    fsyncState.recording = false;
  });

  it('fsyncs the claim file and guard directory before the ledger claim and upstream POST', async () => {
    const fixture = await uploadFixture();
    try {
      await fixture.admit();
      const originalClaim = UploadLedger.prototype.claim;
      const claim = vi.spyOn(UploadLedger.prototype, 'claim').mockImplementation(function (
        this: UploadLedger,
        operationId: string,
        guardClaim?: string
      ) {
        fsyncState.events.push('ledger-claim');
        return originalClaim.call(this, operationId, guardClaim);
      });
      fsyncState.recording = true;

      expect((await fixture.service.dispatch(fixture.input.operationId)).state).toBe('accepted');

      const fileSync = fsyncState.events.indexOf('file-fsync');
      const directorySync = fsyncState.events.indexOf('directory-fsync', fileSync + 1);
      const ledgerClaim = fsyncState.events.indexOf('ledger-claim');
      expect(fileSync).toBeGreaterThanOrEqual(0);
      expect(directorySync).toBeGreaterThan(fileSync);
      expect(ledgerClaim).toBeGreaterThan(directorySync);
      expect(fixture.posts).toBe(1);
      claim.mockRestore();
    } finally {
      fsyncState.recording = false;
      await fixture.close();
    }
  });

  it.each(['file', 'directory'] as const)(
    'does not claim or send when the durable %s fsync reports failure',
    async (kind) => {
      const fixture = await uploadFixture();
      try {
        await fixture.admit();
        const claim = vi.spyOn(UploadLedger.prototype, 'claim');
        fsyncState.armedFailure = kind;
        fsyncState.recording = true;

        expect((await fixture.service.dispatch(fixture.input.operationId)).state).toBe(
          'outcome_unknown'
        );
        expect(claim).not.toHaveBeenCalled();
        expect(fixture.posts).toBe(0);

        fixture.reopen();
        expect((await fixture.service.get(fixture.input.operationId)).state).toBe(
          'outcome_unknown'
        );
        expect((await fixture.service.dispatch(fixture.input.operationId)).state).toBe(
          'outcome_unknown'
        );
        expect(fixture.posts).toBe(0);
        claim.mockRestore();
      } finally {
        fsyncState.recording = false;
        await fixture.close();
      }
    }
  );
});
