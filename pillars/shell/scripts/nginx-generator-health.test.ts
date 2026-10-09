import { afterEach, describe, expect, it } from 'vitest';

import {
  createNginxGeneratorHealth,
  startHealthEndpoint,
  type HealthEndpointHandle,
} from './nginx-generator-health.js';

describe('createNginxGeneratorHealth', () => {
  it('starts in the ok state with no errors and no successes', () => {
    const health = createNginxGeneratorHealth();
    const snap = health.snapshot();
    expect(snap.status).toBe('ok');
    expect(snap.lastSuccessAt).toBeNull();
    expect(snap.lastError).toBeNull();
    expect(snap.nginx_generator_last_error_at).toBeNull();
    expect(snap.consecutiveValidationFailures).toBe(0);
    expect(snap.validationFailureThreshold).toBe(1);
  });

  it('records the first validation error while a configured threshold is not met', () => {
    const health = createNginxGeneratorHealth(3);
    const at = new Date('2026-06-14T01:23:45.000Z');
    health.recordError({ stage: 'validate', message: 'nginx -t failed', at });
    const snap = health.snapshot();
    expect(snap.status).toBe('retrying');
    expect(snap.lastError).toEqual({
      stage: 'validate',
      message: 'nginx -t failed',
      at: at.getTime(),
    });
    expect(snap.nginx_generator_last_error_at).toBe(at.getTime());
    expect(snap.consecutiveValidationFailures).toBe(1);
  });

  it('becomes degraded at the configured consecutive validation failure threshold', () => {
    const health = createNginxGeneratorHealth(2);
    const first = new Date('2026-06-14T01:23:45.000Z');
    health.recordError({ stage: 'validate', message: 'first failure', at: first });
    expect(health.snapshot().status).toBe('retrying');
    expect(health.snapshot().consecutiveValidationFailures).toBe(1);

    health.recordError({
      stage: 'validate',
      message: 'second failure',
      at: new Date(first.getTime() + 1000),
    });
    expect(health.snapshot().status).toBe('degraded');
    expect(health.snapshot().consecutiveValidationFailures).toBe(2);
  });

  it('rejects a non-positive or unsafe validation failure threshold', () => {
    expect(() => createNginxGeneratorHealth(0)).toThrow(RangeError);
    expect(() => createNginxGeneratorHealth(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });

  it('clears lastError after recordSuccess (recovery flow)', () => {
    const health = createNginxGeneratorHealth();
    health.recordError({
      stage: 'regenerate',
      message: 'boom',
      at: new Date('2026-06-14T01:00:00.000Z'),
    });
    expect(health.snapshot().status).toBe('degraded');
    health.recordSuccess(new Date('2026-06-14T01:00:05.000Z'));
    const snap = health.snapshot();
    expect(snap.status).toBe('ok');
    expect(snap.lastError).toBeNull();
    expect(snap.nginx_generator_last_error_at).toBeNull();
    expect(snap.consecutiveValidationFailures).toBe(0);
    expect(snap.lastSuccessAt).toBe(new Date('2026-06-14T01:00:05.000Z').getTime());
  });

  it('keeps lastError pinned to the most recent failure across repeated errors', () => {
    const health = createNginxGeneratorHealth();
    health.recordError({
      stage: 'regenerate',
      message: 'first',
      at: new Date('2026-06-14T01:00:00.000Z'),
    });
    health.recordError({
      stage: 'validate',
      message: 'second',
      at: new Date('2026-06-14T01:00:01.000Z'),
    });
    const snap = health.snapshot();
    expect(snap.lastError?.stage).toBe('validate');
    expect(snap.lastError?.message).toBe('second');
  });
});

describe('startHealthEndpoint', () => {
  const handles: HealthEndpointHandle[] = [];

  afterEach(async () => {
    while (handles.length > 0) {
      const h = handles.pop();
      if (h !== undefined) await h.close();
    }
  });

  it('serves the snapshot as JSON with 200 when healthy', async () => {
    const health = createNginxGeneratorHealth();
    const endpoint = await startHealthEndpoint({ health, port: 0, host: '127.0.0.1' });
    handles.push(endpoint);
    const res = await fetch(`http://127.0.0.1:${endpoint.port}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      status: 'ok',
      lastSuccessAt: null,
      lastError: null,
      nginx_generator_last_error_at: null,
      consecutiveValidationFailures: 0,
      validationFailureThreshold: 1,
    });
  });

  it('returns 503 + degraded payload after an error is recorded', async () => {
    const health = createNginxGeneratorHealth();
    const endpoint = await startHealthEndpoint({ health, port: 0, host: '127.0.0.1' });
    handles.push(endpoint);
    const at = new Date('2026-06-14T02:00:00.000Z');
    health.recordError({ stage: 'reload', message: 'kill: not found', at });

    const res = await fetch(`http://127.0.0.1:${endpoint.port}/health`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as {
      status: string;
      nginx_generator_last_error_at: number | null;
      lastError: { stage: string; message: string; at: number } | null;
    };
    expect(body.status).toBe('degraded');
    expect(body.nginx_generator_last_error_at).toBe(at.getTime());
    expect(body.lastError).toEqual({
      stage: 'reload',
      message: 'kill: not found',
      at: at.getTime(),
    });
  });

  it('returns 503 on the first validation failure at the default threshold', async () => {
    const health = createNginxGeneratorHealth();
    const endpoint = await startHealthEndpoint({ health, port: 0, host: '127.0.0.1' });
    handles.push(endpoint);
    health.recordError({
      stage: 'validate',
      message: 'nginx -t failed',
      at: new Date('2026-06-14T02:00:00.000Z'),
    });

    const response = await fetch(`http://127.0.0.1:${endpoint.port}/health`);
    expect(response.status).toBe(503);
    expect(((await response.json()) as { status: string }).status).toBe('degraded');
  });

  it('keeps validation failures retryable until the configured threshold', async () => {
    const health = createNginxGeneratorHealth(2);
    const endpoint = await startHealthEndpoint({ health, port: 0, host: '127.0.0.1' });
    handles.push(endpoint);
    const url = 'http://127.0.0.1:' + endpoint.port + '/health';
    const at = new Date('2026-06-14T02:00:00.000Z');

    health.recordError({ stage: 'validate', message: 'first', at });
    const retrying = await fetch(url);
    expect(retrying.status).toBe(200);
    const retryingBody = (await retrying.json()) as { status: string };
    expect(retryingBody.status).toBe('retrying');

    health.recordError({
      stage: 'validate',
      message: 'second',
      at: new Date(at.getTime() + 1000),
    });
    const degraded = await fetch(url);
    expect(degraded.status).toBe(503);
    const body = (await degraded.json()) as {
      status: string;
      consecutiveValidationFailures: number;
    };
    expect(body.status).toBe('degraded');
    expect(body.consecutiveValidationFailures).toBe(2);
  });

  it('exposes error timestamps and validation failures as Prometheus metrics', async () => {
    const health = createNginxGeneratorHealth();
    const endpoint = await startHealthEndpoint({ health, port: 0, host: '127.0.0.1' });
    handles.push(endpoint);
    const at = new Date('2026-06-14T02:00:00.000Z');
    health.recordError({ stage: 'validate', message: 'bad config', at });

    const res = await fetch('http://127.0.0.1:' + endpoint.port + '/metrics');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain; version=0.0.4');
    const body = await res.text();
    expect(body).toContain('nginx_generator_last_error_at ' + Math.floor(at.getTime() / 1000));
    expect(body).toContain('nginx_generator_consecutive_validation_failures 1');
  });

  it('returns 404 on unknown paths', async () => {
    const health = createNginxGeneratorHealth();
    const endpoint = await startHealthEndpoint({ health, port: 0, host: '127.0.0.1' });
    handles.push(endpoint);
    const res = await fetch(`http://127.0.0.1:${endpoint.port}/unknown`);
    expect(res.status).toBe(404);
  });

  it('returns 404 on non-GET methods', async () => {
    const health = createNginxGeneratorHealth();
    const endpoint = await startHealthEndpoint({ health, port: 0, host: '127.0.0.1' });
    handles.push(endpoint);
    const res = await fetch(`http://127.0.0.1:${endpoint.port}/health`, { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('honours a custom path', async () => {
    const health = createNginxGeneratorHealth();
    const endpoint = await startHealthEndpoint({
      health,
      port: 0,
      host: '127.0.0.1',
      path: '/nginx-generator/health',
    });
    handles.push(endpoint);
    const ok = await fetch(`http://127.0.0.1:${endpoint.port}/nginx-generator/health`);
    expect(ok.status).toBe(200);
    const miss = await fetch(`http://127.0.0.1:${endpoint.port}/health`);
    expect(miss.status).toBe(404);
  });

  it('reflects state changes (error then success) in subsequent responses', async () => {
    const health = createNginxGeneratorHealth(2);
    const endpoint = await startHealthEndpoint({ health, port: 0, host: '127.0.0.1' });
    handles.push(endpoint);

    health.recordError({
      stage: 'validate',
      message: 'syntax',
      at: new Date('2026-06-14T03:00:00.000Z'),
    });
    const retrying = await fetch(`http://127.0.0.1:${endpoint.port}/health`);
    expect(retrying.status).toBe(200);
    expect(((await retrying.json()) as { status: string }).status).toBe('retrying');

    health.recordSuccess(new Date('2026-06-14T03:00:01.000Z'));
    const recovered = await fetch(`http://127.0.0.1:${endpoint.port}/health`);
    expect(recovered.status).toBe(200);
    const body = (await recovered.json()) as {
      lastError: unknown;
      nginx_generator_last_error_at: unknown;
    };
    expect(body.lastError).toBeNull();
    expect(body.nginx_generator_last_error_at).toBeNull();
  });
});
