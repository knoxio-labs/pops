/**
 * Tests for {@link ANZ_STATEMENT_ROW}'s balance-and-marker capture (POPS-2882).
 *
 * `anz-pdf-statement.test.ts` covers the row-to-`ParsedTransaction` shaping;
 * these tests pin the regex itself, including the description-group index the
 * backfill migration depends on ({@link anzPdfStatementLineDescription}).
 */
import { describe, expect, it } from 'vitest';

import { ANZ_STATEMENT_ROW, anzPdfStatementLineDescription } from '../anz-statement-line.js';

function row(balanceSuffix: string, amountSuffix = ''): string {
  return `24/04/2025 22/04/2025 4821 ALDI STORES - MARRICKV    MARRICKVILLE 20.40${amountSuffix} 1,020.40${balanceSuffix}`;
}

describe('ANZ_STATEMENT_ROW balance capture', () => {
  it('captures an unmarked balance with no marker group', () => {
    const match = ANZ_STATEMENT_ROW.exec(row(''));
    expect(match?.[6]).toBe('1,020.40');
    expect(match?.[7]).toBeUndefined();
  });

  it('captures a CR-marked balance', () => {
    const match = ANZ_STATEMENT_ROW.exec(row(' CR'));
    expect(match?.[6]).toBe('1,020.40');
    expect(match?.[7]).toBe(' CR');
  });

  it('captures a DR-marked balance', () => {
    const match = ANZ_STATEMENT_ROW.exec(row(' DR'));
    expect(match?.[6]).toBe('1,020.40');
    expect(match?.[7]).toBe(' DR');
  });

  it('captures the balance on a row whose amount also carries the CR marker', () => {
    const match = ANZ_STATEMENT_ROW.exec(row(' CR', ' CR'));
    expect(match?.[5]).toBe(' CR');
    expect(match?.[6]).toBe('1,020.40');
    expect(match?.[7]).toBe(' CR');
  });

  it('still finds the description at group 3, unaffected by the new balance groups', () => {
    expect(anzPdfStatementLineDescription(row(' CR'))).toBe(
      'ALDI STORES - MARRICKV    MARRICKVILLE'
    );
  });

  it('does not match a row with no balance at all', () => {
    expect(
      ANZ_STATEMENT_ROW.test('24/04/2025 22/04/2025 4821 TRUNCATED ROW WITH NO BALANCE 12.34')
    ).toBe(false);
  });
});
