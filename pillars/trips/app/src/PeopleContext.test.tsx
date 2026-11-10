import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { PeopleContext } from './index';
import { createClient } from './trips-api/client';

import type { ContactsHostCapability } from '@pops/pillar-sdk';
import type { PeopleWorkspaceProps } from '@pops/trips-workspace';

const workspace = vi.hoisted(() => vi.fn<(props: PeopleWorkspaceProps) => void>());
const translate = vi.hoisted(() => vi.fn((key: string) => key));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: translate }) }));
vi.mock('@pops/trips-workspace', () => ({
  PeopleWorkspace: (props: PeopleWorkspaceProps) => {
    workspace(props);
    return <p>People source {props.tripId}</p>;
  },
}));
afterEach(() => {
  cleanup();
  workspace.mockClear();
  translate.mockClear();
});

it('forwards the owning Trip identity, transport and opaque Contacts capability without a router', () => {
  const contacts: ContactsHostCapability = { createIntent: () => ({ Chooser: () => null }) };
  const client = createClient({ baseUrl: 'http://localhost/trips-api' });
  const view = render(<PeopleContext tripId={7} contacts={contacts} client={client} />);
  expect(screen.getByText('People source 7')).toBeVisible();
  expect(workspace).toHaveBeenLastCalledWith(
    expect.objectContaining({ tripId: 7, contacts, client })
  );
  const props = workspace.mock.calls[0]?.[0];
  expect(props?.text('visit', { id: 2 })).toBe('people.visit');
  expect(translate).toHaveBeenCalledWith('people.visit', { id: 2 });

  const nextClient = createClient({ baseUrl: 'http://localhost/other-trips-api' });
  view.rerender(<PeopleContext tripId={8} client={nextClient} />);
  expect(screen.getByText('People source 8')).toBeVisible();
  expect(workspace).toHaveBeenLastCalledWith(
    expect.objectContaining({ tripId: 8, client: nextClient })
  );
  expect(workspace.mock.lastCall?.[0].contacts).toBeUndefined();
});
