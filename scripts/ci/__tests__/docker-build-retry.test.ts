/**
 * The retry Publish Images wraps each image build in (POPS-3425). Both
 * directions are the contract, per ADR-045: an infrastructure fault is retried,
 * and a defect in the image is not — a retry that swallowed a failed `RUN`
 * would turn a real break into three slow ones and then, on a lucky cache hit,
 * into a green run.
 */
import { describe, expect, it, vi } from 'vitest';

import { buildWithTransientRetry, isTransientBuildFailure } from '../docker-build-retry.mjs';

/** Verbatim from the runs POPS-3425 measured on 2026-09-06. */
const REGISTRY_502 =
  'ERROR: failed to solve: node:24-alpine: failed to resolve source metadata for docker.io/library/node:24-alpine: unexpected status from HEAD request to https://registry-1.docker.io/v2/library/node/manifests/24-alpine: 502 Bad Gateway';
const UNKNOWN_BLOB = 'ERROR: failed to build: unknown blob';

const FAILED_RUN =
  'ERROR: failed to solve: process "/bin/sh -c pnpm --filter @pops/food build" did not complete successfully: exit code: 2';
const TYPE_ERROR =
  "src/api/server.ts(12,7): error TS2322: Type 'string' is not assignable to type 'number'.";
const MISSING_FILE =
  'ERROR: failed to solve: failed to compute cache key: "/pillars/food/package.json": not found';
const REGISTRY_404 =
  'ERROR: failed to solve: failed to resolve source metadata for docker.io/library/node:99-alpine: docker.io/library/node:99-alpine: not found';

describe('isTransientBuildFailure', () => {
  it.each([
    ['a registry 502 resolving a base image', REGISTRY_502],
    ['BuildKit losing a blob', UNKNOWN_BLOB],
    [
      'a 503 from a different registry',
      'failed to resolve source metadata for ghcr.io/x/y:1: 503 Service Unavailable',
    ],
  ])('retries %s', (_label, output) => {
    expect(isTransientBuildFailure(output)).toBe(true);
  });

  it.each([
    ['a failed RUN step', FAILED_RUN],
    ['a type error', TYPE_ERROR],
    ['a missing file in the context', MISSING_FILE],
    ['a base image that does not exist', REGISTRY_404],
    ['no output at all', ''],
  ])('does not retry %s', (_label, output) => {
    expect(isTransientBuildFailure(output)).toBe(false);
  });
});

describe('buildWithTransientRetry', () => {
  const noSleep = async () => {};

  it('succeeds on the first attempt without sleeping', async () => {
    const sleep = vi.fn(noSleep);
    const result = await buildWithTransientRetry({
      attempts: 3,
      run: async () => ({ ok: true, output: '' }),
      sleep,
      backoffMs: () => 1,
    });
    expect(result).toEqual({ success: true, attempt: 1, transient: false });
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries a transient failure and succeeds on the next attempt', async () => {
    const run = vi.fn(async (attempt: number) =>
      attempt === 1 ? { ok: false, output: UNKNOWN_BLOB } : { ok: true, output: '' }
    );
    const result = await buildWithTransientRetry({
      attempts: 3,
      run,
      sleep: noSleep,
      backoffMs: () => 0,
    });
    expect(result).toEqual({ success: true, attempt: 2, transient: false });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('fails a real build error on the first attempt and never retries it', async () => {
    const run = vi.fn(async () => ({ ok: false, output: FAILED_RUN }));
    const events: string[] = [];
    const result = await buildWithTransientRetry({
      attempts: 3,
      run,
      sleep: noSleep,
      backoffMs: () => 0,
      onEvent: (event) => events.push(event.type),
    });
    expect(result).toEqual({ success: false, attempt: 1, transient: false });
    expect(run).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['not-transient']);
  });

  it('stops retrying when a transient failure turns into a real one', async () => {
    const run = vi.fn(async (attempt: number) => ({
      ok: false,
      output: attempt === 1 ? REGISTRY_502 : TYPE_ERROR,
    }));
    const result = await buildWithTransientRetry({
      attempts: 3,
      run,
      sleep: noSleep,
      backoffMs: () => 0,
    });
    expect(result).toEqual({ success: false, attempt: 2, transient: false });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('gives up after the bounded attempts when every failure is transient', async () => {
    const run = vi.fn(async () => ({ ok: false, output: REGISTRY_502 }));
    const slept: number[] = [];
    const result = await buildWithTransientRetry({
      attempts: 3,
      run,
      sleep: async (ms) => {
        slept.push(ms);
      },
      backoffMs: (a) => a,
    });
    expect(result).toEqual({ success: false, attempt: 3, transient: true });
    expect(run).toHaveBeenCalledTimes(3);
    expect(slept).toEqual([1, 2]);
  });

  it('refuses a configuration with no attempts', async () => {
    await expect(
      buildWithTransientRetry({
        attempts: 0,
        run: async () => ({ ok: true, output: '' }),
        sleep: noSleep,
        backoffMs: () => 0,
      })
    ).rejects.toThrow(RangeError);
  });
});
