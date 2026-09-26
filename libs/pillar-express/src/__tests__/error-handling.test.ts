import { RequestValidationError } from '@ts-rest/express';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  createBodyParserErrorHandler,
  createPopsErrorHandler,
  createRequestIdMiddleware,
  createRequestValidationErrorHandler,
  createUnmatchedRouteHandler,
  defineErrors,
  PopsError,
} from '../error-handling.js';

function appWith(handler: express.RequestHandler): express.Express {
  const app = express();
  app.use(createRequestIdMiddleware());
  app.get('/test', handler);
  app.use(createUnmatchedRouteHandler({ pillar: 'test' }));
  app.use(createPopsErrorHandler({ pillar: 'test' }));
  return app;
}

describe('PopsError', () => {
  it('serializes a registered error with request metadata', async () => {
    const app = appWith(() => {
      throw new PopsError({
        code: 'test.resource.missing',
        status: 404,
        message: 'The resource is missing.',
        retryable: false,
        details: { resource: 'item' },
      });
    });

    const response = await request(app).get('/test').set('X-Request-Id', 'req-known');

    expect(response.status).toBe(404);
    expect(response.headers['x-request-id']).toBe('req-known');
    expect(response.body).toEqual({
      code: 'test.resource.missing',
      message: 'The resource is missing.',
      requestId: 'req-known',
      retryable: false,
      details: { resource: 'item' },
    });
  });

  it('does not expose an unknown error message or stack', async () => {
    const error = new Error('database password in the message');
    const logger = { error: vi.fn() };
    const app = express();
    app.use(createRequestIdMiddleware());
    app.get('/test', (_req, _res, next) => next(error));
    app.use(createPopsErrorHandler({ pillar: 'test', logger }));

    const response = await request(app).get('/test');

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      code: 'test.internal',
      message: 'The service could not complete the request.',
      retryable: false,
    });
    expect(JSON.stringify(response.body)).not.toContain('database password');
    expect(JSON.stringify(response.body)).not.toContain('stack');
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

describe('shared Express error handlers', () => {
  it('mints a ULID-shaped request id when the caller sends none', async () => {
    const app = appWith((_req, res) => res.json({ ok: true }));

    const response = await request(app).get('/test');

    expect(response.headers['x-request-id']).toMatch(/^[0-9A-Z]{26}$/);
  });

  it('includes validation issues under details.issues', async () => {
    const parsed = z.object({ id: z.string() }).safeParse({ id: 7 });
    if (parsed.success) throw new Error('test fixture unexpectedly parsed');

    const app = express();
    app.use(createRequestIdMiddleware());
    app.get('/test', (_req, _res, next) => {
      next(new RequestValidationError(null, null, null, parsed.error));
    });
    app.use(createRequestValidationErrorHandler({ pillar: 'test' }));

    const response = await request(app).get('/test');

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('test.request.invalid');
    expect(response.body.details.issues).toHaveLength(1);
  });

  it('returns JSON for an oversized body', async () => {
    const app = express();
    app.use(createRequestIdMiddleware());
    app.use(express.json({ limit: '10b' }));
    app.use(createBodyParserErrorHandler({ pillar: 'test' }));

    const response = await request(app).post('/test').send({ value: 'body too large' });

    expect(response.status).toBe(413);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toMatchObject({
      code: 'test.request.body_too_large',
      message: 'The request body is too large.',
      retryable: false,
    });
  });

  it('returns a JSON 404 for an unmatched route', async () => {
    const app = express();
    app.use(createRequestIdMiddleware());
    app.use(createUnmatchedRouteHandler({ pillar: 'test' }));

    const response = await request(app).get('/missing');

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('test.route.not_found');
  });
});

describe('defineErrors', () => {
  it('creates typed throwers with dotted registered codes', () => {
    const errors = defineErrors('inventory', {
      missing: {
        area: 'item',
        status: 404,
        message: 'The item was not found.',
        retryable: false,
      },
    });

    expect(() => errors.missing({ id: 'item-1' })).toThrowError(PopsError);
    try {
      errors.missing({ id: 'item-1' });
    } catch (error) {
      expect(error).toMatchObject({
        code: 'inventory.item.missing',
        status: 404,
        retryable: false,
        details: { id: 'item-1' },
      });
    }
  });
});
