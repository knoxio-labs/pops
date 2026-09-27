import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@pops/pillar-sdk/client';
import { toastError } from '@pops/ui';

import { createAppQueryClient } from './App';

vi.mock(import('@pops/ui'), async (importOriginal) => ({
  ...(await importOriginal()),
  toastError: vi.fn(),
}));

function apiError(retryable: boolean): ApiError {
  return new ApiError({
    code: retryable ? 'inventory.sync.unavailable' : 'inventory.items.not_found',
    kind: retryable ? 'server' : 'client',
    message: retryable ? 'Sync is unavailable' : 'Item not found',
    requestId: 'req-123',
    retryable,
  });
}

async function runFailedMutation(error: unknown, meta?: Record<string, unknown>): Promise<void> {
  const client = createAppQueryClient();
  const mutation = client.getMutationCache().build(client, {
    meta,
    mutationKey: ['inventory', 'items', 'save'],
    mutationFn: () => Promise.reject(error),
  });
  await mutation.execute(undefined).catch(() => undefined);
  client.clear();
}

describe('App query client error handling', () => {
  afterEach(() => {
    vi.mocked(toastError).mockReset();
  });

  it.each([true, false])(
    'toasts a failed mutation once when retryable is %s',
    async (retryable) => {
      const error = apiError(retryable);

      await runFailedMutation(error);

      expect(toastError).toHaveBeenCalledOnce();
      expect(toastError).toHaveBeenCalledWith(error, {
        build: 'dev',
        operation: 'inventory.items.save',
      });
    }
  );

  it('does not toast a mutation that owns its error presentation', async () => {
    await runFailedMutation(apiError(false), { errorHandled: true });

    expect(toastError).not.toHaveBeenCalled();
  });

  it('normalises an undefined mutation rejection before toasting', async () => {
    await runFailedMutation(undefined);

    expect(toastError).toHaveBeenCalledOnce();
    expect(vi.mocked(toastError).mock.calls[0]?.[0]).toMatchObject({
      code: 'web.client.unknown',
      message: 'Something went wrong',
      retryable: false,
    });
  });

  it('toasts network query failures with their query operation', async () => {
    const client = createAppQueryClient();
    const error = new ApiError({
      code: 'web.net.offline',
      kind: 'offline',
      message: 'The request could not reach the server',
      retryable: true,
    });

    await client
      .fetchQuery({
        queryKey: ['inventory', 'items'],
        queryFn: () => Promise.reject(error),
        retry: false,
      })
      .catch(() => undefined);

    expect(toastError).toHaveBeenCalledWith(error, {
      build: 'dev',
      id: 'network-down',
      operation: 'inventory.items',
    });
    client.clear();
  });

  it('leaves non-network query failures to their rendered error state', async () => {
    const client = createAppQueryClient();

    await client
      .fetchQuery({
        queryKey: ['inventory', 'items'],
        queryFn: () => Promise.reject(apiError(false)),
        retry: false,
      })
      .catch(() => undefined);

    expect(toastError).not.toHaveBeenCalled();
    client.clear();
  });
});
