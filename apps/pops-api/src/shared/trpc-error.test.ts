import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';

import { trpcError } from './trpc-error.js';

describe('trpcError()', () => {
  it('creates a TRPCError with the correct code and resolved message', () => {
    const err = trpcError('NOT_FOUND', 'common.notFound', { resource: 'Budget', id: '42' });
    expect(err).toBeInstanceOf(TRPCError);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe("Budget '42' not found");
  });

  it('attaches messageKey on the cause', () => {
    const err = trpcError('BAD_REQUEST', 'common.validationFailed');
    expect(err.cause).toBeDefined();
    expect(err.cause).toBeInstanceOf(Error);
    expect(err.cause).toHaveProperty('messageKey', 'common.validationFailed');
  });

  it('works without params for parameterless messages', () => {
    const err = trpcError('NOT_FOUND', 'finance.import.sessionNotFound');
    expect(err.message).toBe('Import session not found');
  });

  it('passes through an original cause', () => {
    const original = new Error('db failure');
    const err = trpcError('INTERNAL_SERVER_ERROR', 'common.internalError', undefined, original);
    expect(err.cause).toBeInstanceOf(Error);
    expect(err.cause).toHaveProperty('cause', original);
  });
});
