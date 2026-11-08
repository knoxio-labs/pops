import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { ContactError } from '../errors';
import { personSnapshot, personTestGateway } from './test-fixtures';
import { usePerson } from './usePerson';

import type { ReactNode } from 'react';

import type { Address } from '../contacts-api/types.gen';

it('serializes same-tick writes and accepts only the one acknowledged server receipt', async () => {
  const fixture = personSnapshot().addresses[0];
  if (!fixture) throw new Error('Missing address fixture');
  let finish: (address: Address) => void = () => {
    throw new Error('Write not started');
  };
  const addAddress = vi.fn(
    () =>
      new Promise<Address>((resolve) => {
        finish = resolve;
      })
  );
  const gateway = { ...personTestGateway(), addAddress };
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => usePerson('person', gateway), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  let first: Promise<boolean> = Promise.resolve(false);
  await act(async () => {
    first = result.current.addAddress('New');
    expect(await result.current.addAddress('Duplicate')).toBe(false);
  });
  expect(addAddress).toHaveBeenCalledExactlyOnceWith('person', 'New');
  await act(async () => {
    finish({ ...fixture, id: 'new', value: 'New' });
    expect(await first).toBe(true);
  });
  expect(result.current.data?.addresses.map((address) => address.value)).toEqual([
    fixture.value,
    'New',
  ]);
});

it('allows validation recovery and reports unexpected failures without leaking their message', async () => {
  const gateway = personTestGateway();
  const save = vi
    .fn(gateway.save)
    .mockRejectedValueOnce(new ContactError('invalidRequest', 'contacts.http.400'))
    .mockRejectedValueOnce(new Error('private server internals'));
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => usePerson('person', { ...gateway, save }), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  await act(async () => {
    expect(await result.current.save({ name: '', notes: '' })).toBe(false);
  });
  expect(result.current.uncertain).toBe(false);
  await act(async () => {
    expect(await result.current.save({ name: 'Marina', notes: '' })).toBe(false);
  });
  expect(result.current.error?.message).not.toContain('private server internals');
  expect(result.current.error).toMatchObject({ diagnostic: 'contacts.person.write' });
  expect(result.current.uncertain).toBe(true);
});
