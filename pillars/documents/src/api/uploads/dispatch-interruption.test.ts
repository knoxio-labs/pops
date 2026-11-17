import { describe, expect, it } from 'vitest';

import { uploadFixture } from './__tests__/fixture.js';
import { DispatchGuard } from './dispatch-guard.js';
import { UploadLedger } from './ledger.js';

describe('dispatch interruption recovery', () => {
  it('quarantines a durable guard acquisition interrupted before the ledger claim', async () => {
    const fixture = await uploadFixture();
    try {
      await fixture.admit();
      const ledger = new UploadLedger(fixture.database.db);
      const row = ledger.find(fixture.input.operationId);
      if (row === undefined) throw new Error('Admitted upload row is missing');

      const guard = new DispatchGuard(
        fixture.database.db,
        fixture.guardDirectory,
        fixture.guardId,
        fixture.directory
      );
      expect(guard.acquire(row)).toEqual(expect.any(String));
      expect(row.state).toBe('admitted');
      expect(fixture.posts).toBe(0);

      fixture.reopen();

      expect((await fixture.service.get(fixture.input.operationId)).state).toBe('outcome_unknown');
      expect((await fixture.service.dispatch(fixture.input.operationId)).state).toBe(
        'outcome_unknown'
      );
      expect(fixture.posts).toBe(0);
    } finally {
      await fixture.close();
    }
  });
});
