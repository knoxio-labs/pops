import { pendingImportById } from '@/fixtures/pending-imports';
import { discardCopy } from '@/kit/discard-pending-dialog';
import { describe, expect, it } from 'vitest';

describe('discardCopy', () => {
  it('reassures on a live import: the bank resends, only decisions go', () => {
    const copy = discardCopy(pendingImportById('p-up-live'));
    expect(copy.title).toBe('Discard this Up import?');
    expect(copy.body).toMatch(/^The 11 transactions are not deleted anywhere\. Up still has them/);
    expect(copy.action).toBe('Discard, Up will resend');
  });

  it('counts the decisions lost on a file draft and names the file to re-upload', () => {
    const copy = discardCopy(pendingImportById('p-amex-aug'));
    expect(copy.title).toBe('Discard activity_2026-08.csv?');
    expect(copy.body).toBe(
      'The 43 decisions you made in it are lost. The file itself is not stored: to import it later, upload activity_2026-08.csv again.'
    );
  });

  it('does not count decisions on an unusable draft, which already lost them', () => {
    const copy = discardCopy(pendingImportById('p-anz-old'));
    expect(copy.body).toMatch(/^Nothing in this draft can be resumed\./);
    expect(copy.body).not.toMatch(/decisions/);
  });

  it('singularises one decision and never goes negative', () => {
    const one = discardCopy({
      ...pendingImportById('p-amex-aug'),
      rowCount: 2,
      unresolvedCount: 1,
    });
    expect(one.body).toMatch(/^The 1 decision you made/);
    const none = discardCopy({
      ...pendingImportById('p-amex-aug'),
      rowCount: 1,
      unresolvedCount: 5,
    });
    expect(none.body).toMatch(/^The 0 decisions/);
  });
});
