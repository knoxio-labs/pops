import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useArrangementContacts } from './use-arrangement-contacts';

import type { ContactChooserIntent, ContactsHostCapability } from '@pops/pillar-sdk';

afterEach(cleanup);
function capability() {
  const createIntent = vi.fn<ContactsHostCapability['createIntent']>(() => ({
    Chooser: () => null,
  }));
  return { createIntent };
}
const rental = { targetKind: 'rental', targetId: 61 } as const;
describe('Arrangement owner picker intent retention', () => {
  it('creates lazily and retains the actual opaque intent across rerenders', () => {
    const contacts = capability();
    const { result, rerender } = renderHook(() => useArrangementContacts(contacts, 7));
    expect(contacts.createIntent).not.toHaveBeenCalled();
    const first = result.current?.(rental);
    rerender();
    expect(result.current?.(rental)).toBe(first);
    expect(contacts.createIntent).toHaveBeenCalledTimes(1);
  });
  it('separates exact trip/source targets while preserving earlier operations after switching', () => {
    const contacts = capability();
    const { result, rerender } = renderHook(
      ({ tripId }) => useArrangementContacts(contacts, tripId),
      { initialProps: { tripId: 7 } }
    );
    const first = result.current?.(rental);
    expect(result.current?.({ targetKind: 'stay', targetId: 61 })).not.toBe(first);
    expect(result.current?.({ targetKind: 'rental', targetId: 62 })).not.toBe(first);
    rerender({ tripId: 8 });
    expect(result.current?.(rental)).not.toBe(first);
    rerender({ tripId: 7 });
    expect(result.current?.(rental)).toBe(first);
    expect(contacts.createIntent).toHaveBeenCalledTimes(4);
  });
  it('does not request owner UI without a host or valid route identity', () => {
    const contacts = capability();
    const initialProps: { owner: ContactsHostCapability | undefined; tripId: number | undefined } =
      { owner: undefined, tripId: 7 };
    const { result, rerender } = renderHook(
      ({
        owner,
        tripId,
      }: {
        owner: ContactsHostCapability | undefined;
        tripId: number | undefined;
      }) => useArrangementContacts(owner, tripId),
      { initialProps }
    );
    expect(result.current).toBeUndefined();
    rerender({ owner: contacts, tripId: undefined });
    expect(result.current).toBeUndefined();
    expect(contacts.createIntent).not.toHaveBeenCalled();
  });
  it('keeps distinct owner capability sessions isolated and retained', () => {
    const first = capability();
    const second = capability();
    const { result, rerender } = renderHook(({ contacts }) => useArrangementContacts(contacts, 7), {
      initialProps: { contacts: first },
    });
    let original: ContactChooserIntent | undefined;
    act(() => {
      original = result.current?.(rental);
    });
    rerender({ contacts: second });
    expect(result.current?.(rental)).not.toBe(original);
    rerender({ contacts: first });
    expect(result.current?.(rental)).toBe(original);
    expect(first.createIntent).toHaveBeenCalledTimes(1);
    expect(second.createIntent).toHaveBeenCalledTimes(1);
  });
});
