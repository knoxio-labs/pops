/**
 * Unit test for `interpretRejectionFeedback`'s degrade path on a genuine
 * Claude completion failure (CF019/#3625 follow-through): this call is a
 * best-effort refinement inside `proposeChangeSetFromCorrectionSignal`, not
 * its primary output, so a `ClaudeCompletionError` here must fall back to the
 * original signal rather than aborting the whole propose flow.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, type FinanceDb, type OpenedFinanceDb } from '../../../../db/index.js';
import { invalidateAiSettingsCache } from '../../ai-settings-resolver.js';
import { interpretRejectionFeedback } from '../ai-feedback.js';
import { __setClaudeCompleterForTests, ClaudeCompletionError } from '../ai-runtime.js';

import type { CorrectionSignal } from '../ai-types.js';

const originalSignal: CorrectionSignal = {
  descriptionPattern: 'WOOLWORTHS',
  matchType: 'contains',
  entityName: 'Woolworths',
};

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;

beforeEach(() => {
  invalidateAiSettingsCache();
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-ai-feedback-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
  db = opened.db;
});

afterEach(() => {
  __setClaudeCompleterForTests(null);
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('interpretRejectionFeedback — degrades on ClaudeCompletionError', () => {
  it('returns the original signal when the completer throws ClaudeCompletionError', async () => {
    __setClaudeCompleterForTests(() => {
      throw new ClaudeCompletionError('rate limited', 'RATE_LIMITED');
    });

    const result = await interpretRejectionFeedback(
      db,
      originalSignal,
      {
        ops: [
          {
            op: 'add',
            data: { descriptionPattern: 'WOOLWORTHS', matchType: 'contains', tags: [] },
          },
        ],
      },
      'too broad'
    );

    expect(result).toEqual(originalSignal);
  });

  it('still propagates an unrelated error', async () => {
    __setClaudeCompleterForTests(() => {
      throw new Error('boom');
    });

    await expect(
      interpretRejectionFeedback(
        db,
        originalSignal,
        {
          ops: [
            {
              op: 'add',
              data: { descriptionPattern: 'WOOLWORTHS', matchType: 'contains', tags: [] },
            },
          ],
        },
        'too broad'
      )
    ).rejects.toThrow('boom');
  });
});
