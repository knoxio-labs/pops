import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { ContactError } from '../errors';
import { ConnectionsPanel } from './ConnectionsPanel';

import type { ContactConnection, ConnectionsGateway } from './contracts';

const account: ContactConnection = {
  accountId: 'google-account',
  provider: 'google',
  label: 'Fictional address book',
  connected: true,
  reauthorizationRequired: false,
  includeOtherContacts: false,
  latestRunId: 'failed-attempt',
  previewRunId: 'completed-preview',
};
function gateway(accounts: ContactConnection[] = []): ConnectionsGateway {
  return {
    list: vi.fn().mockResolvedValue(accounts),
    authorize: vi.fn().mockResolvedValue('https://accounts.google.com/o/oauth2/v2/auth'),
    connectIcloud: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue('new-run'),
    scan: vi.fn(async (id: string) => ({
      runId: id,
      accountId: account.accountId,
      status: id === 'failed-attempt' ? 'failed' : 'completed',
      totalCollections: 1,
      completedCollections: 1,
      batchIds: id === 'failed-attempt' ? [] : ['actual-staged-batch'],
    })),
  };
}
function mount(api: ConnectionsGateway) {
  const client = new QueryClient();
  const navigate = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ConnectionsPanel gateway={api} navigate={navigate} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { client, navigate, user: userEvent.setup() };
}

describe('provider connections', () => {
  it('opens the entire disconnected card and defaults Google Other contacts to false', async () => {
    const api = gateway();
    const { user, navigate } = mount(api);
    await user.click(
      await screen.findByRole('button', { name: 'Google: Connect account. Open connection' })
    );
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByRole('checkbox', { name: 'Include Other contacts' })).not.toBeChecked();
    expect(api.authorize).not.toHaveBeenCalled();
    await user.click(dialog.getByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(api.authorize).toHaveBeenCalledWith(undefined, false));
    expect(navigate).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth');
  });
  it('requests the extra read-only scope only after explicit selection', async () => {
    const api = gateway();
    const { user } = mount(api);
    await user.click(await screen.findByRole('button', { name: /Google: Connect account/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Include Other contacts' }));
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(api.authorize).toHaveBeenCalledWith(undefined, true));
  });
  it('keeps a previous completed preview reachable when the latest scan failed', async () => {
    const api = gateway([account]);
    const { user } = mount(api);
    await user.click(await screen.findByRole('button', { name: /Google: Connected/ }));
    const previous = await screen.findByRole('region', { name: 'Previous completed preview' });
    expect(await within(previous).findByRole('link', { name: 'Review preview 1' })).toHaveAttribute(
      'href',
      '/contacts/imports/actual-staged-batch'
    );
    expect(screen.getByRole('region', { name: 'Latest import preparation' })).toHaveTextContent(
      'Preparation failed'
    );
    expect(api.scan).toHaveBeenCalledWith('completed-preview');
    await user.click(screen.getByRole('button', { name: 'Prepare import' }));
    await waitFor(() => expect(api.start).toHaveBeenCalledWith('google-account'));
    await waitFor(() => expect(api.scan).toHaveBeenCalledWith('new-run'));
  });
  it('requires reconnecting an expired account and retains its explicit scope setting', async () => {
    const api = gateway([
      { ...account, reauthorizationRequired: true, includeOtherContacts: true },
    ]);
    const { user } = mount(api);
    await user.click(await screen.findByRole('button', { name: /Google: Reconnect required/ }));
    expect(screen.getByRole('checkbox', { name: 'Include Other contacts' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(api.authorize).toHaveBeenCalledWith('google-account', true));
  });
  it('does not portray a failed status request as disconnected accounts', async () => {
    const api = gateway();
    vi.mocked(api.list).mockRejectedValue(new ContactError('unauthorized', 'contacts.http.401'));
    mount(api);
    expect(await screen.findByRole('alert')).toHaveTextContent('401');
    expect(screen.queryByRole('button', { name: /Google:/ })).not.toBeInTheDocument();
    expect(api.authorize).not.toHaveBeenCalled();
  });
  it('sends iCloud credentials only on submit and clears the password after failure', async () => {
    const api = gateway();
    vi.mocked(api.connectIcloud).mockRejectedValue(
      new ContactError('forbidden', 'contacts.http.403')
    );
    const { user, client } = mount(api);
    await user.click(await screen.findByRole('button', { name: /iCloud: Connect account/ }));
    await user.type(screen.getByLabelText('Apple account email'), 'fictional@example.test');
    await user.type(screen.getByLabelText('App-specific password'), 'fictional-only');
    expect(api.connectIcloud).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Connect iCloud' }));
    await waitFor(() =>
      expect(api.connectIcloud).toHaveBeenCalledWith({
        accountId: undefined,
        username: 'fictional@example.test',
        password: 'fictional-only',
      })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('403');
    expect(screen.getByLabelText('App-specific password')).toHaveValue('');
    expect(JSON.stringify(client.getQueryCache().getAll())).not.toContain('fictional-only');
  });
  it('disconnects only the selected account and explains contact retention', async () => {
    const api = gateway([account]);
    const { user } = mount(api);
    await user.click(await screen.findByRole('button', { name: /Google: Connected/ }));
    expect(
      screen.getByText('Disconnecting retains imported contacts and their source history.')
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    await waitFor(() => expect(api.disconnect).toHaveBeenCalledWith('google-account'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
