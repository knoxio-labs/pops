/**
 * The log line is the whole point of this module: the failure it describes is
 * invisible otherwise. So it has to send an operator to the right place —
 * which is not the same place for a record the ai pillar refused and a record
 * that never reached it.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AiUsageRecordRefusedError } from '@pops/ai-telemetry';

import {
  AI_BASE_URL_ENV,
  LEDGER_CREDENTIAL_ENV,
  LEDGER_CREDENTIAL_FILE_ENV,
  LEDGER_SECRET_ENV_AT_AI,
  ledgerReportFailedMessage,
  resolveLedgerCredential,
} from '../ai-ledger-credential.js';

describe('ledgerReportFailedMessage', () => {
  it('sends a refusal at the credential pairing, naming both halves', () => {
    const line = ledgerReportFailedMessage(new AiUsageRecordRefusedError(403, 'purchases.secret'));

    expect(line).toContain('403');
    expect(line).toContain('refused');
    expect(line).toContain(LEDGER_CREDENTIAL_FILE_ENV);
    expect(line).toContain(LEDGER_CREDENTIAL_ENV);
    expect(line).toContain(LEDGER_SECRET_ENV_AT_AI);
    expect(line).not.toContain('purchases.secret');
  });

  it('calls a transport failure a delivery failure rather than blaming provisioning', () => {
    const line = ledgerReportFailedMessage(new Error('fetch failed: ECONNREFUSED'));

    expect(line).toContain('ECONNREFUSED');
    expect(line).toContain(AI_BASE_URL_ENV);
    // An unreachable ai-api says nothing about whether the pairing is right,
    // so the line must not open by pointing at it.
    expect(line).toContain('delivery rather than the credential');
    expect(line).not.toContain('refused the record');
  });

  it('describes a non-Error rejection rather than dropping the detail', () => {
    expect(ledgerReportFailedMessage('socket hang up')).toContain('socket hang up');
  });
});

describe('resolveLedgerCredential', () => {
  it('prefers a readable file over the inline value, trimmed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'purchases-ledger-credential-'));
    try {
      const path = join(dir, 'credential');
      writeFileSync(path, 'purchases.from-file\n');
      expect(
        resolveLedgerCredential({
          [LEDGER_CREDENTIAL_ENV]: 'purchases.inline',
          [LEDGER_CREDENTIAL_FILE_ENV]: path,
        })
      ).toBe('purchases.from-file');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is undefined when neither source is set', () => {
    expect(resolveLedgerCredential({})).toBeUndefined();
  });
});
