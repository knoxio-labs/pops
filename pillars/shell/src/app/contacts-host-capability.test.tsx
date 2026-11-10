import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { ContactChooserSession } from '@pops/app-contacts';

import { createContactsHostCapability } from './contacts-host-capability';

import type { ContactChooserProps } from '@pops/app-contacts';

afterEach(cleanup);

const sessions: ContactChooserSession[] = [];
function OwnerChooser({ session, onSelect }: ContactChooserProps) {
  if (!session) throw new Error('Missing retained owner session');
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
const owner = { ContactChooserSession, ContactChooser: OwnerChooser };

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
