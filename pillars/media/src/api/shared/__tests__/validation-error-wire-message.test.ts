/**
 * What a `ValidationError` raised inside media puts on the wire.
 *
 * Until POPS-3043 this pillar's `ValidationError` took `(details: unknown)`
 * alone and hardcoded `'Validation failed'` as the message, so the four sites
 * below — three of them handler translators that had deliberately pulled
 * `err.message` off a domain error in order to surface it — produced a 400
 * body no caller could act on.
 *
 * These assert the **body** rather than the status, because the status is
 * exactly the part that stayed right the whole time: a 400 saying
 * `Validation failed` and a 400 saying which dimension is inactive are
 * indistinguishable to a status assertion.
 */
import { describe, expect, it } from 'vitest';

import { RotationCandidateNotPendingError } from '../../../db/errors.js';
import {
  InactiveDimensionError,
  InvalidWinnerError,
} from '../../../db/services/comparisons/errors.js';
import { guard } from '../../rest/comparisons-handlers-shared.js';
import { guardRotation } from '../../rest/rotation-handlers-shared.js';
import { ValidationError } from '../errors.js';

/** The registered failure a throwing call produces, or a failure if it did not throw. */
function errorOf(fn: () => unknown): ValidationError {
  try {
    fn();
  } catch (err) {
    if (err instanceof ValidationError) return err;
    throw err;
  }
  throw new Error('expected the call to throw');
}

/** The same, for a rejected promise. */
async function errorOfAsync(fn: () => Promise<unknown>): Promise<ValidationError> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof ValidationError) return err;
    throw err;
  }
  throw new Error('expected the call to reject');
}

describe('ValidationError', () => {
  it('puts a one-argument message on the wire', () => {
    expect(
      errorOf(() => {
        throw new ValidationError('Invalid Plex URL');
      })
    ).toMatchObject({ message: 'Invalid Plex URL', code: 'media.request.invalid' });
  });

  it('keeps the message on the wire when structured details are supplied', () => {
    expect(
      errorOf(() => {
        throw new ValidationError('Invalid Plex URL', { url: 'not-a-url' });
      }).message
    ).toBe('Invalid Plex URL');
  });

  it('never serves the generic default for a site that supplied prose', () => {
    expect(
      errorOf(() => {
        throw new ValidationError('anything at all');
      }).message
    ).not.toBe('Validation failed');
  });
});

describe('the handler translators POPS-3043 unblocked', () => {
  it('comparisons: forwards an inactive dimension explanation', () => {
    expect(
      errorOf(() =>
        guard(() => {
          throw new InactiveDimensionError("Dimension 'pace' is inactive");
        })
      ).message
    ).toBe("Dimension 'pace' is inactive");
  });

  it('comparisons: forwards an invalid-winner explanation', () => {
    expect(
      errorOf(() =>
        guard(() => {
          throw new InvalidWinnerError('Winner must be one of the compared media');
        })
      ).message
    ).toBe('Winner must be one of the compared media');
  });

  it('rotation: names the candidate and the status it is already in', async () => {
    const error = await errorOfAsync(() =>
      guardRotation(() => {
        throw new RotationCandidateNotPendingError(7, 'accepted');
      })
    );
    expect(error.message).toBe(new RotationCandidateNotPendingError(7, 'accepted').message);
  });
});
