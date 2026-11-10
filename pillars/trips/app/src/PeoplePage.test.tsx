import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';

import { PeoplePage } from './PeoplePage';

import type { ContactsHostCapability } from '@pops/pillar-sdk';

const workspace = vi.hoisted(() => vi.fn());
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@pops/trips-workspace', () => ({
  PeopleWorkspace: (props: { tripId: number; contacts?: ContactsHostCapability }) => {
    workspace(props);
    return <p>People source {props.tripId}</p>;
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
        <Route path="/:tripId/people" element={<PeoplePage contacts={contacts} />} />
      </Routes>
    </MemoryRouter>
  );
}

it('forwards the validated owning trip and opaque host capability without importing a Contact implementation', () => {
  const contacts: ContactsHostCapability = { createIntent: () => ({ Chooser: () => null }) };
  mount('/7/people', contacts);
  expect(screen.getByText('People source 7')).toBeVisible();
  expect(workspace).toHaveBeenCalledWith(expect.objectContaining({ tripId: 7, contacts }));
});
it.each(['/0/people', '/01/people', '/invalid/people', '/9007199254740992/people'])(
  'rejects invalid owning identity %s before source reads',
  (path) => {
    mount(path);
    expect(screen.getByText('people.invalid')).toBeVisible();
    expect(workspace).not.toHaveBeenCalled();
  }
);
