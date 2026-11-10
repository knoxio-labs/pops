import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { PeopleChooser } from './PeopleChooser';

import type { ContactChooserIntent, ContactChooserMountProps } from '@pops/pillar-sdk';

import type { PeopleWorkspaceProps } from './types';

afterEach(cleanup);
function retainedOwnerIntent(): ContactChooserIntent {
  let retained = '';
  function Chooser({ open, onOpenChange, onSelect }: ContactChooserMountProps) {
    const [draft, setDraft] = useState(retained);
    if (!open) return null;
    return (
      <dialog open aria-label="Contact owner chooser">
        <input
          aria-label="Owner search"
          value={draft}
          onChange={(event) => {
            retained = event.currentTarget.value;
            setDraft(retained);
          }}
        />
        <button onClick={() => onOpenChange(false)}>Close owner chooser</button>
        <button
          onClick={() => {
            onSelect({
              name: retained,
              reference: { uri: 'pops:contacts/contact/owner-only', canonicalId: 'owner-only' },
            });
            onOpenChange(false);
          }}
        >
          Select owner identity
        </button>
      </dialog>
    );
  }
  return { Chooser };
}

it('retains one opaque owner intent and draft across close/reopen and route remount, then starts a new explicit intent after selection', async () => {
  const createIntent = vi.fn(retainedOwnerIntent);
  const select = vi.fn();
  const workspace: PeopleWorkspaceProps = {
    tripId: 7461,
    text: (key) => key,
    contacts: { createIntent },
  };
  function Host() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <button onClick={() => setOpen(true)}>Open chooser</button>
        <PeopleChooser
          {...{ workspace, open }}
          intentKey="add"
          onOpenChange={setOpen}
          onSelect={select}
        />
      </>
    );
  }
  const first = render(<Host />);
  await screen.findByRole('dialog');
  fireEvent.change(screen.getByLabelText('Owner search'), {
    target: { value: 'Retained owner draft' },
  });
  fireEvent.click(screen.getByText('Close owner chooser'));
  fireEvent.click(screen.getByText('Open chooser'));
  expect(screen.getByLabelText('Owner search')).toHaveValue('Retained owner draft');
  first.unmount();
  render(<Host />);
  expect(await screen.findByLabelText('Owner search')).toHaveValue('Retained owner draft');
  expect(createIntent).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('Select owner identity'));
  expect(select).toHaveBeenCalledWith('pops:contacts/contact/owner-only');
  fireEvent.click(screen.getByText('Open chooser'));
  await waitFor(() => expect(createIntent).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText('Owner search')).toHaveValue('');
});
