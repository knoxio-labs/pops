import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EventPage } from './EventPage';

import type { ContactsHostCapability } from '@pops/pillar-sdk';

const workspace = vi.hoisted(() => vi.fn());
vi.mock('@pops/trips-workspace', () => ({
  EventWorkspace: (props: {
    tripId: number;
    eventId: number;
    contacts?: ContactsHostCapability;
  }) => {
    workspace(props);
    return (
      <p>
        Event source {props.tripId}:{props.eventId}
      </p>
    );
  },
}));
afterEach(() => {
  cleanup();
  workspace.mockClear();
});

function mount(path: string, contacts?: ContactsHostCapability) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/:tripId/events/:eventId" element={<EventPage contacts={contacts} />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Event source route', () => {
  it('passes canonical owning identities to the source-backed workspace', () => {
    mount('/7/events/19');
    expect(screen.getByText('Event source 7:19')).toBeVisible();
    expect(workspace).toHaveBeenCalledWith({ tripId: 7, eventId: 19, contacts: undefined });
  });
  it('forwards the actual host capability unchanged without loading a Contacts app implementation', () => {
    const contacts: ContactsHostCapability = {
      createIntent: vi.fn(() => ({ Chooser: () => null })),
    };
    mount('/7/events/19', contacts);
    expect(workspace).toHaveBeenCalledWith({ tripId: 7, eventId: 19, contacts });
    expect(contacts.createIntent).not.toHaveBeenCalled();
  });
  it.each(['/0/events/19', '/7/events/01', '/invalid/events/19', '/7/events/9007199254740992'])(
    'rejects invalid identity %s before mounting a source reader',
    (path) => {
      mount(path);
      expect(screen.getByText('Choose a valid trip and event')).toBeVisible();
      expect(workspace).not.toHaveBeenCalled();
    }
  );
});
