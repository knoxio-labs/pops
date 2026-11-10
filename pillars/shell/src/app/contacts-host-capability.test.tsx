import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { ContactChooserSession } from '@pops/app-contacts';

import { createContactsHostCapability } from './contacts-host-capability';

import type { ContactChooserProps } from '@pops/app-contacts';

afterEach(cleanup);

const sessions: ContactChooserSession[] = [];
function OwnerChooser({ session, onSelect, open }: ContactChooserProps) {
  if (!session) throw new Error('Missing retained owner session');
  if (!open) return null;
  sessions.push(session);
  return (
    <button
      onClick={() =>
        onSelect(
          {
            id: 'opaque',
            name: 'Actual owner',
            type: 'person',
            aliases: [],
            defaultTags: [],
            lastEditedTime: '',
          },
          { canonicalId: 'opaque', uri: 'pops:contacts/contact/opaque' }
        )
      }
    >
      {session.snapshot().name || 'Owner chooser'}
    </button>
  );
}
const readContactReference = vi
  .fn<typeof import('@pops/app-contacts').readContactReference>()
  .mockResolvedValue({ status: 'missing', diagnostic: 'missing' });
const owner = { ContactChooserSession, ContactChooser: OwnerChooser, readContactReference };

it('forwards retained reads lazily through the public owner with the exact URI and cancellation signal', async () => {
  const load = vi.fn(async () => owner);
  const capability = createContactsHostCapability(load);
  expect(load).not.toHaveBeenCalled();
  if (!capability.readContactReference) throw new Error('Missing public reader');
  const options = { signal: new AbortController().signal };
  await expect(
    capability.readContactReference('pops:contacts/contact/historical', options)
  ).resolves.toMatchObject({ status: 'missing' });
  expect(load).toHaveBeenCalledTimes(1);
  expect(readContactReference).toHaveBeenCalledWith('pops:contacts/contact/historical', options);
});

it('loads lazily and retains one opaque owner session through remount, with independent new intents', async () => {
  sessions.length = 0;
  const load = vi.fn(async () => owner);
  const capability = createContactsHostCapability(load);
  const first = capability.createIntent();
  expect(load).not.toHaveBeenCalled();
  const props = { open: true, onOpenChange: vi.fn(), onSelect: vi.fn() };
  const view = render(
    <Suspense>
      <first.Chooser {...props} />
    </Suspense>
  );
  await screen.findByRole('button', { name: 'Owner chooser' });
  const retained = sessions.at(-1);
  if (!retained) throw new Error('Owner was not mounted');
  retained.setName('Retained pending intent');
  view.unmount();
  const remounted = render(
    <Suspense>
      <first.Chooser {...props} />
    </Suspense>
  );
  await screen.findByRole('button', { name: 'Retained pending intent' });
  expect(sessions.at(-1)).toBe(retained);
  expect(load).toHaveBeenCalledTimes(1);
  remounted.unmount();
  const second = capability.createIntent();
  render(
    <Suspense>
      <second.Chooser {...props} />
    </Suspense>
  );
  await screen.findByRole('button', { name: 'Owner chooser' });
  expect(sessions.at(-1)).not.toBe(retained);
});

it.each(['missing', 'unavailable', 'readError'] as const)(
  'preserves the owner %s read outcome without substituting available identity',
  async (status) => {
    const outcome = { status, diagnostic: 'Owner read outcome' };
    const read = vi
      .fn<typeof import('@pops/app-contacts').readContactReference>()
      .mockResolvedValue(outcome);
    const capability = createContactsHostCapability(async () => ({
      ...owner,
      readContactReference: read,
    }));
    if (!capability.readContactReference) throw new Error('Missing public reader');
    expect(await capability.readContactReference('pops:contacts/contact/opaque')).toBe(outcome);
    expect(read).toHaveBeenCalledExactlyOnceWith('pops:contacts/contact/opaque', undefined);
  }
);

it('preserves a reader module-load failure for the consumer instead of inventing an owner outcome', async () => {
  const failure = new Error('Owner module unavailable');
  const load = vi.fn<() => Promise<typeof owner>>().mockRejectedValue(failure);
  const capability = createContactsHostCapability(load);
  if (!capability.readContactReference) throw new Error('Missing public reader');
  await expect(capability.readContactReference('pops:contacts/contact/opaque')).rejects.toBe(
    failure
  );
  expect(load).toHaveBeenCalledTimes(1);
});

it('keeps a closed intent inactive while its module arrives and resumes it without another owner load', async () => {
  let resolve = (_owner: typeof owner): void => {
    throw new Error('Not started');
  };
  const loaded = new Promise<typeof owner>((done) => {
    resolve = done;
  });
  const load = vi.fn(() => loaded);
  const capability = createContactsHostCapability(load);
  const intent = capability.createIntent();
  const selection = vi.fn();
  const props = { onOpenChange: vi.fn(), onSelect: selection };
  const view = render(
    <Suspense>
      <intent.Chooser {...props} open />
    </Suspense>
  );
  view.rerender(
    <Suspense>
      <intent.Chooser {...props} open={false} />
    </Suspense>
  );
  await act(async () => resolve(owner));
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(selection).not.toHaveBeenCalled();
  view.rerender(
    <Suspense>
      <intent.Chooser {...props} open />
    </Suspense>
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Owner chooser' }));
  expect(selection).toHaveBeenCalledTimes(1);
  expect(load).toHaveBeenCalledTimes(1);
});

it('does not deliver a replaced intent when its owner module arrives late', async () => {
  let resolve = (_owner: typeof owner): void => {
    throw new Error('Not started');
  };
  const loaded = new Promise<typeof owner>((done) => {
    resolve = done;
  });
  const capability = createContactsHostCapability(() => loaded);
  const first = capability.createIntent();
  const second = capability.createIntent();
  const oldSelection = vi.fn();
  const selection = vi.fn();
  const props = { open: true, onOpenChange: vi.fn() };
  const view = render(
    <Suspense>
      <first.Chooser {...props} onSelect={oldSelection} />
    </Suspense>
  );
  view.rerender(
    <Suspense>
      <second.Chooser {...props} onSelect={selection} />
    </Suspense>
  );
  await act(async () => resolve(owner));
  fireEvent.click(await screen.findByRole('button', { name: 'Owner chooser' }));
  expect(oldSelection).not.toHaveBeenCalled();
  expect(selection).toHaveBeenCalledWith({
    name: 'Actual owner',
    reference: { canonicalId: 'opaque', uri: 'pops:contacts/contact/opaque' },
  });
});
