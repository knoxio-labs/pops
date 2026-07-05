/**
 * Unit test for `interpretRejectionFeedback`'s degrade path on a genuine
 * Claude completion failure (CF019/#3625 follow-through): this call is a
 * best-effort refinement inside `proposeChangeSetFromCorrectionSignal`, not
 * its primary output, so a `ClaudeCompletionError` here must fall back to the
 * original signal rather than aborting the whole propose flow.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { interpretRejectionFeedback } from '../ai-feedback.js';
import { __setClaudeCompleterForTests, ClaudeCompletionError } from '../ai-runtime.js';

import type { CorrectionSignal } from '../ai-types.js';

const originalSignal: CorrectionSignal = {
  descriptionPattern: 'WOOLWORTHS',
  matchType: 'contains',
  entityName: 'Woolworths',
};

afterEach(() => {
  __setClaudeCompleterForTests(null);
});

describe('interpretRejectionFeedback — degrades on ClaudeCompletionError', () => {
  it('returns the original signal when the completer throws ClaudeCompletionError', async () => {
    __setClaudeCompleterForTests(() => {
      throw new ClaudeCompletionError('rate limited', 'RATE_LIMITED');
    });

    const result = await interpretRejectionFeedback(
      originalSignal,
      { ops: [{ op: 'add', data: { descriptionPattern: 'WOOLWORTHS', matchType: 'contains' } }] },
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
        originalSignal,
        { ops: [{ op: 'add', data: { descriptionPattern: 'WOOLWORTHS', matchType: 'contains' } }] },
        'too broad'
      )
    ).rejects.toThrow('boom');
  });
});
