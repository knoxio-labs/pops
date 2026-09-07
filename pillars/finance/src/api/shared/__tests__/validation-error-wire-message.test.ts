/**
 * What a `ValidationError` thrown deep in a module puts on the wire.
 *
 * `ValidationError` carries two strings-shaped arguments, only one of which
 * the client ever sees, and until POPS-3037 they were in the order that made
 * the wrong one easiest to pass: eleven sites supplied prose as `details` and
 * shipped a 400 body reading `Validation failed` (POPS-3005). `details:
 * unknown` cannot refuse a string, so nothing in the type system says which
 * way round a call is.
 *
 * These assert the **body** rather than the status, because a swapped call
 * still returns 400 — the status is exactly the part that stays right when the
 * arguments are wrong. One representative throw site per module the reversal
 * touched, driven through the real `mapHttpError` so the assertion covers the
 * whole path from throw to envelope.
 */
import { describe, expect, it } from 'vitest';

import { TagsOnlyCorrectionError, InvalidPatternError } from '../../../db/errors.js';
import {
  assertNotTagsOnly,
  assertPatternCanMatch,
  assertPatternCompiles,
} from '../../modules/corrections/add-op-guards.js';
import { assertPersistableEntityId } from '../../modules/imports/commit-validation.js';
import { translateCorrectionError } from '../../rest/corrections-handlers-support.js';
import { mapHttpError } from '../../rest/error-mapping.js';
import { ValidationError } from '../errors.js';

import type { ChangeSetOp } from '../../../contract/index.js';

/** The 400 body a throwing call produces, or the failure if it did not throw. */
function wireBodyOf(fn: () => unknown): { message: string; code?: string } {
  try {
    fn();
  } catch (err) {
    const mapped = mapHttpError(err);
    if (mapped === null) throw err;
    return mapped.body;
  }
  throw new Error('expected the call to throw');
}

function addOp(data: Partial<Extract<ChangeSetOp, { op: 'add' }>['data']>) {
  return {
    op: 'add',
    data: {
      descriptionPattern: 'WOOLWORTHS',
      accountId: null,
      matchType: 'exact',
      tags: [],
      ...data,
    },
  } as Extract<ChangeSetOp, { op: 'add' }>;
}

describe('ValidationError', () => {
  it('puts a one-argument message on the wire', () => {
    expect(
      wireBodyOf(() => {
        throw new ValidationError('Upload is empty.');
      })
    ).toMatchObject({ message: 'Upload is empty.', code: 'ValidationError' });
  });

  it('still puts the message on the wire when structured details are supplied', () => {
    const maxBytes = 2 * 1024 * 1024;
    expect(
      wireBodyOf(() => {
        throw new ValidationError(`Exceeds the maximum allowed size of ${maxBytes} bytes.`, {
          byteLength: maxBytes + 1,
        });
      }).message
    ).toBe(`Exceeds the maximum allowed size of ${maxBytes} bytes.`);
  });

  it('never serves the generic default for a site that supplied prose', () => {
    expect(
      wireBodyOf(() => {
        throw new ValidationError('anything at all');
      }).message
    ).not.toBe('Validation failed');
  });
});

describe('the modules POPS-3037 reversed', () => {
  it('imports: names the placeholder entity id it refused', () => {
    expect(wireBodyOf(() => assertPersistableEntityId('temp:e1', null)).message).toBe(
      "Entity id 'temp:e1' has no resolved contact; refusing to commit a placeholder"
    );
  });

  it('corrections: explains why a tags-only rule is refused', () => {
    expect(wireBodyOf(() => assertNotTagsOnly(addOp({ tags: ['coffee'] }))).message).toBe(
      new TagsOnlyCorrectionError().message
    );
  });

  it('corrections: quotes the regex that would not compile', () => {
    expect(
      wireBodyOf(() =>
        assertPatternCompiles(addOp({ matchType: 'regex', descriptionPattern: '[unclosed' }))
      ).message
    ).toBe(new InvalidPatternError('[unclosed').message);
  });

  it('corrections: accepts a numeric pattern', () => {
    expect(() => assertPatternCanMatch(addOp({ descriptionPattern: '1234' }))).not.toThrow();
  });

  it('rest: forwards a translated domain error message rather than swallowing it', () => {
    expect(
      wireBodyOf(() => translateCorrectionError(new InvalidPatternError('([a-z'))).message
    ).toBe(new InvalidPatternError('([a-z').message);
  });
});
