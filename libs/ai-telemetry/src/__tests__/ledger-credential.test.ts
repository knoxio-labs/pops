/**
 * The generic ledger-credential logic every reporting pillar's caller-specific
 * wrapper builds on (POPS-2332, extracted from purchases' POPS-1785 module).
 * The log line is the whole point: the failure it describes is invisible
 * otherwise, so it has to name the right env vars for the right failure.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  ledgerReportFailedMessage,
  resolveLedgerCredential,
  resolveSecret,
  type LedgerCredentialConfig,
} from '../ledger-credential.js';
import { AiUsageRecordRefusedError } from '../report-sink.js';

const FINANCE_CONFIG: LedgerCredentialConfig = {
  callerName: 'finance',
  logPrefix: '[finance-api]',
  secretEnvVarAtAi: 'POPS_INTERNAL_SECRET_FINANCE',
};

describe('ledgerReportFailedMessage', () => {
  it('sends a refusal at the credential pairing, naming both halves and this caller', () => {
    const line = ledgerReportFailedMessage(
      FINANCE_CONFIG,
      new AiUsageRecordRefusedError(403, 'finance.secret')
    );

    expect(line).toContain('403');
    expect(line).toContain('refused');
    expect(line).toContain('POPS_INTERNAL_CREDENTIAL_FILE');
    expect(line).toContain('POPS_INTERNAL_CREDENTIAL');
    expect(line).toContain('POPS_INTERNAL_SECRET_FINANCE');
    expect(line).toContain("'finance.<secret>'");
    expect(line).not.toContain('finance.secret');
  });

  it('calls a transport failure a delivery failure rather than blaming provisioning', () => {
    const line = ledgerReportFailedMessage(FINANCE_CONFIG, new Error('fetch failed: ECONNREFUSED'));

    expect(line).toContain('ECONNREFUSED');
    expect(line).toContain('AI_API_URL');
    expect(line).toContain('delivery rather than the credential');
    expect(line).not.toContain('refused the record');
  });

  it('describes a non-Error rejection rather than dropping the detail', () => {
    expect(ledgerReportFailedMessage(FINANCE_CONFIG, 'socket hang up')).toContain('socket hang up');
  });

  it('uses a caller-specific secretEnvVarAtAi, not a hardcoded one', () => {
    const cerebrumLine = ledgerReportFailedMessage(
      {
        ...FINANCE_CONFIG,
        callerName: 'cerebrum',
        secretEnvVarAtAi: 'POPS_INTERNAL_SECRET_CEREBRUM',
      },
      new AiUsageRecordRefusedError(403, 'cerebrum.secret')
    );
    expect(cerebrumLine).toContain('POPS_INTERNAL_SECRET_CEREBRUM');
    expect(cerebrumLine).not.toContain('POPS_INTERNAL_SECRET_FINANCE');
  });
});

describe('resolveLedgerCredential', () => {
  it('prefers a readable file over the inline value, trimmed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ledger-credential-'));
    try {
      const path = join(dir, 'credential');
      writeFileSync(path, 'finance.from-file\n');
      expect(
        resolveLedgerCredential(FINANCE_CONFIG, {
          POPS_INTERNAL_CREDENTIAL: 'finance.inline',
          POPS_INTERNAL_CREDENTIAL_FILE: path,
        })
      ).toBe('finance.from-file');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is undefined when neither source is set', () => {
    expect(resolveLedgerCredential(FINANCE_CONFIG, {})).toBeUndefined();
  });
});

describe('resolveSecret', () => {
  it('falls back to the env var and warns when the configured file cannot be read', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(
        resolveSecret(
          {
            fileEnvVar: 'SOME_FILE',
            envVar: 'SOME_VALUE',
            env: { SOME_FILE: '/no/such/file', SOME_VALUE: 'inline-value' },
          },
          '[test]'
        )
      ).toBe('inline-value');
      expect(warn.mock.calls.some((call) => String(call[0]).includes('[test]'))).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
});
