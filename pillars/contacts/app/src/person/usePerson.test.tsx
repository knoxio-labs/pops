import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { ContactError } from '../errors';
import { personDraft } from './draft';
import { personSnapshot, personTestGateway } from './test-fixtures';
import { usePerson } from './usePerson';

import type { ReactNode } from 'react';

import type { FactReceipt } from '../contacts-api/types.gen';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

it('serializes same-tick atomic saves and accepts only the acknowledged receipt', async () => {
  const data = personSnapshot();
  const gateway = personTestGateway(data);
  let finish: (receipt: FactReceipt) => void = () => {
    throw new Error('Write not started');
  };
  const save = vi.fn(
    () =>
      new Promise<FactReceipt>((resolve) => {
        finish = resolve;
      })
  );
  const { result } = renderHook(() => usePerson('person', { ...gateway, save }), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  const draft = { ...personDraft(data), name: 'Edited' };
  let first: Promise<boolean> = Promise.resolve(false);
  await act(async () => {
    first = result.current.save(draft);
    expect(await result.current.save(draft)).toBe(false);
  });
  expect(save).toHaveBeenCalledExactlyOnceWith('person', draft, data);
  await act(async () => {
    finish(await gateway.save('person', draft, data));
    expect(await first).toBe(true);
  });
  expect(result.current.data?.entity.name).toBe('Edited');
  expect(result.current.canUndo).toBe(true);
});

it('does not undo an unavailable operation or expose unexpected server failures', async () => {
  const data = personSnapshot();
  const gateway = personTestGateway(data);
  const save = vi
    .fn(gateway.save)
    .mockRejectedValueOnce(new ContactError('invalidRequest', 'contacts.http.400'))
    .mockRejectedValueOnce(new Error('private internals'));
  const { result } = renderHook(() => usePerson('person', { ...gateway, save }), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.canUndo).toBe(false);
  await act(async () => {
    expect(await result.current.save(personDraft(data))).toBe(false);
  });
  expect(result.current.uncertain).toBe(false);
  await act(async () => {
    expect(await result.current.save(personDraft(data))).toBe(false);
  });
  expect(result.current.error?.message).not.toContain('private internals');
  expect(result.current.error).toMatchObject({ diagnostic: 'contacts.person.write' });
  expect(result.current.uncertain).toBe(true);
});

it('never chooses a foreign operation as this editor undo target after reload', async () => {
  const data = personSnapshot();
  const gateway = personTestGateway(data);
  const ownReceipt = await gateway.save('person', personDraft(data), data);
  const foreign = { id: 'foreign-operation', createdAt: '2026-11-10T00:02:00Z', canUndo: true };
  const load = vi
    .fn(gateway.load)
    .mockResolvedValueOnce(data)
    .mockResolvedValue({
      ...data,
      ...ownReceipt.data,
      version: 9,
      operations: [...ownReceipt.data.operations, foreign],
    });
  const undo = vi.fn(gateway.undo);
  const { result } = renderHook(() => usePerson('person', { ...gateway, load, undo }), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  await act(async () => {
    await result.current.save(personDraft(data));
  });
  await act(async () => {
    await result.current.reload();
  });
  await act(async () => {
    await result.current.undo();
  });
  expect(undo).toHaveBeenCalledExactlyOnceWith('person', 'operation', 9);
});
