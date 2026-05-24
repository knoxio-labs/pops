import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';

import { BudgetExceededError, ConflictError, NotFoundError, ValidationError } from './errors.js';
import { mapDomainErrors, mapDomainErrorsAsync } from './trpc-error-mapper.js';

describe('mapDomainErrors', () => {
  it('returns the inner value when no throw', () => {
    expect(mapDomainErrors(() => 42)).toBe(42);
  });

  it('maps NotFoundError → NOT_FOUND', () => {
    let caught: unknown;
    try {
      mapDomainErrors(() => {
        throw new NotFoundError('Fixture', 'x');
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TRPCError);
    expect((caught as TRPCError).code).toBe('NOT_FOUND');
    expect((caught as TRPCError).message).toBe("Fixture 'x' not found");
  });

  it('maps ConflictError → CONFLICT', () => {
    expect(() =>
      mapDomainErrors(() => {
        throw new ConflictError('dup');
      })
    ).toThrow(TRPCError);
    try {
      mapDomainErrors(() => {
        throw new ConflictError('dup');
      });
    } catch (err) {
      expect((err as TRPCError).code).toBe('CONFLICT');
    }
  });

  it('maps ValidationError → BAD_REQUEST', () => {
    try {
      mapDomainErrors(() => {
        throw new ValidationError({ field: 'name' });
      });
    } catch (err) {
      expect((err as TRPCError).code).toBe('BAD_REQUEST');
    }
  });

  it('maps BudgetExceededError → PAYMENT_REQUIRED', () => {
    try {
      mapDomainErrors(() => {
        throw new BudgetExceededError({
          budgetId: 'b',
          limitType: 'cost',
          currentUsage: 10,
          limit: 5,
        });
      });
    } catch (err) {
      expect((err as TRPCError).code).toBe('PAYMENT_REQUIRED');
    }
  });

  it('rethrows non-HttpError unchanged', () => {
    const sentinel = new Error('boom');
    expect(() =>
      mapDomainErrors(() => {
        throw sentinel;
      })
    ).toThrow(sentinel);
  });
});

describe('mapDomainErrorsAsync', () => {
  it('returns the resolved value', async () => {
    await expect(mapDomainErrorsAsync(async () => 'ok')).resolves.toBe('ok');
  });

  it('maps an async-thrown NotFoundError', async () => {
    await expect(
      mapDomainErrorsAsync(async () => {
        throw new NotFoundError('Fixture', 'x');
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rethrows a non-HttpError unchanged', async () => {
    const sentinel = new Error('boom');
    await expect(
      mapDomainErrorsAsync(async () => {
        throw sentinel;
      })
    ).rejects.toBe(sentinel);
  });
});
