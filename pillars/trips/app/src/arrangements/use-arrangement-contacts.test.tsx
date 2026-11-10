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
    const first = result.current.contactChooserIntent?.(rental);
    rerender();
    expect(result.current.contactChooserIntent?.(rental)).toBe(first);
    expect(contacts.createIntent).toHaveBeenCalledTimes(1);
  });
  it('separates exact trip/source targets while preserving earlier operations after switching', () => {
    const contacts = capability();
    const { result, rerender } = renderHook(
      ({ tripId }) => useArrangementContacts(contacts, tripId),
      { initialProps: { tripId: 7 } }
    );
    const first = result.current.contactChooserIntent?.(rental);
    expect(result.current.contactChooserIntent?.({ targetKind: 'stay', targetId: 61 })).not.toBe(
      first
    );
    expect(result.current.contactChooserIntent?.({ targetKind: 'rental', targetId: 62 })).not.toBe(
      first
    );
    rerender({ tripId: 8 });
    expect(result.current.contactChooserIntent?.(rental)).not.toBe(first);
    rerender({ tripId: 7 });
    expect(result.current.contactChooserIntent?.(rental)).toBe(first);
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
    expect(result.current.contactChooserIntent).toBeUndefined();
    rerender({ owner: contacts, tripId: undefined });
    expect(result.current.contactChooserIntent).toBeUndefined();
    expect(contacts.createIntent).not.toHaveBeenCalled();
  });
  it('advances only the acknowledged active intent on the next explicit picker action', () => {
    const contacts = capability();
    const { result } = renderHook(() => useArrangementContacts(contacts, 7));
    const first = result.current.contactChooserIntent?.(rental);
    if (!first) throw new Error('Expected an actual owner intent');
    expect(result.current.contactChooserIntent?.(rental)).toBe(first);
    result.current.advanceContactChooserIntent?.(rental, first);
    expect(contacts.createIntent).toHaveBeenCalledTimes(1);
    const next = result.current.contactChooserIntent?.(rental);
    expect(next).not.toBe(first);
    result.current.advanceContactChooserIntent?.(rental, first);
    expect(result.current.contactChooserIntent?.(rental)).toBe(next);
    expect(contacts.createIntent).toHaveBeenCalledTimes(2);
  });
  it('keeps distinct owner capability sessions isolated and retained', () => {
    const first = capability();
    const second = capability();
    const { result, rerender } = renderHook(({ contacts }) => useArrangementContacts(contacts, 7), {
      initialProps: { contacts: first },
    });
    let original: ContactChooserIntent | undefined;
    act(() => {
      original = result.current.contactChooserIntent?.(rental);
    });
    rerender({ contacts: second });
    expect(result.current.contactChooserIntent?.(rental)).not.toBe(original);
    rerender({ contacts: first });
    expect(result.current.contactChooserIntent?.(rental)).toBe(original);
    expect(first.createIntent).toHaveBeenCalledTimes(1);
    expect(second.createIntent).toHaveBeenCalledTimes(1);
  });
});
