/**
 * The service→HTTP mapping, tested directly.
 *
 * These branches are deliberately hard to reach over HTTP because the wire
 * schema mirrors the database's CHECK constraints, so a bad payload is
 * rejected by zod before SQLite ever sees it. That redundancy is the point
 * — but it means the SQLite-side branches need a unit test, or they are
 * only exercised the day the two descriptions drift apart.
 */
import { RequestValidationError } from '@ts-rest/express';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import {
  DuplicatePurchaseError,
  PurchaseNotFoundError,
  PurchaseSourceNotFoundError,
} from '../../db/index.js';
import { createRequestValidationErrorHandler, tryMapServiceError } from '../rest/error-mapping.js';
import {
  isCheckConstraintError,
  isForeignKeyConstraintError,
  isUniqueConstraintError,
} from '../shared/sqlite-errors.js';
import { PASSED_THROUGH_STATUS, passThroughErrorReporter } from './helpers.js';

function sqliteError(code: string): Error {
  return Object.assign(new Error(`${code}: constraint failed`), { code });
}

describe('tryMapServiceError', () => {
  it('maps both not-found errors to 404', () => {
    expect(tryMapServiceError(new PurchaseNotFoundError('p1'))).toMatchObject({
      status: 404,
      body: { code: 'NOT_FOUND' },
    });
    expect(tryMapServiceError(new PurchaseSourceNotFoundError('s1'))).toMatchObject({
      status: 404,
    });
  });

  it('maps a duplicate purchase to 409 with a code an adapter can branch on', () => {
    expect(tryMapServiceError(new DuplicatePurchaseError('c1'))).toMatchObject({
      status: 409,
      body: { code: 'DUPLICATE_PURCHASE' },
    });
  });

  it('maps a UNIQUE violation to 409', () => {
    expect(tryMapServiceError(sqliteError('SQLITE_CONSTRAINT_UNIQUE'))).toMatchObject({
      status: 409,
      body: { code: 'CONFLICT_UNIQUE' },
    });
  });

  it('maps a FOREIGN KEY violation to 409', () => {
    expect(tryMapServiceError(sqliteError('SQLITE_CONSTRAINT_FOREIGNKEY'))).toMatchObject({
      status: 409,
      body: { code: 'CONFLICT_FK' },
    });
  });

  it('maps a CHECK violation to 400, because the payload is wrong rather than conflicting', () => {
    expect(tryMapServiceError(sqliteError('SQLITE_CONSTRAINT_CHECK'))).toMatchObject({
      status: 400,
      body: { code: 'CONSTRAINT_CHECK' },
    });
  });

  it('returns null for anything it does not recognise, so the stack is not swallowed', () => {
    expect(tryMapServiceError(new Error('disk on fire'))).toBeNull();
    expect(tryMapServiceError('a string')).toBeNull();
    expect(tryMapServiceError(null)).toBeNull();
    expect(tryMapServiceError({ code: 42 })).toBeNull();
  });
});

describe('createRequestValidationErrorHandler', () => {
  it('answers a RequestValidationError with the contract-shaped 400, dropping the issues', async () => {
    const app = express();
    app.get('/boom', (_req, _res, next) => {
      next(new RequestValidationError(null, null, null, null));
    });
    app.use(createRequestValidationErrorHandler());

    const res = await request(app).get('/boom');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: 'Request does not match the contract schema',
      code: 'VALIDATION_ERROR',
    });
  });

  it('forwards anything else to the next handler unmapped', async () => {
    const app = express();
    app.get('/boom', (_req, _res, next) => {
      next(new Error('unrelated failure'));
    });
    app.use(createRequestValidationErrorHandler());
    app.use(passThroughErrorReporter);

    const res = await request(app).get('/boom');

    expect(res.status).toBe(PASSED_THROUGH_STATUS);
    expect(res.body).toEqual({ passedThrough: 'unrelated failure' });
  });
});

describe('sqlite error predicates', () => {
  it('match on the code rather than the message, which has changed across releases', () => {
    expect(isUniqueConstraintError(sqliteError('SQLITE_CONSTRAINT_UNIQUE'))).toBe(true);
    expect(isForeignKeyConstraintError(sqliteError('SQLITE_CONSTRAINT_FOREIGNKEY'))).toBe(true);
    expect(isCheckConstraintError(sqliteError('SQLITE_CONSTRAINT_CHECK'))).toBe(true);
  });

  it('do not confuse one constraint kind for another', () => {
    expect(isUniqueConstraintError(sqliteError('SQLITE_CONSTRAINT_CHECK'))).toBe(false);
    expect(isCheckConstraintError(sqliteError('SQLITE_CONSTRAINT_UNIQUE'))).toBe(false);
    expect(isForeignKeyConstraintError(sqliteError('SQLITE_BUSY'))).toBe(false);
  });

  it('tolerate a non-error value', () => {
    for (const value of [undefined, null, 'boom', 7, {}]) {
      expect(isUniqueConstraintError(value)).toBe(false);
    }
  });
});
