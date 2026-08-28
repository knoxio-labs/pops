import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { plexGetAuthPinMock, plexCheckAuthPinMock, plexDisconnectMock, plexGetPlexUsernameMock } =
  vi.hoisted(() => ({
    plexGetAuthPinMock: vi.fn(),
    plexCheckAuthPinMock: vi.fn(),
    plexDisconnectMock: vi.fn(),
    plexGetPlexUsernameMock: vi.fn(),
  }));

vi.mock('../../media-api/index.js', () => ({
  plexGetAuthPin: (...args: unknown[]) => plexGetAuthPinMock(...args),
  plexCheckAuthPin: (...args: unknown[]) => plexCheckAuthPinMock(...args),
  plexDisconnect: (...args: unknown[]) => plexDisconnectMock(...args),
  plexGetPlexUsername: (...args: unknown[]) => plexGetPlexUsernameMock(...args),
}));

import { PlexConnectPanel } from './PlexConnectPanel';

function ok<T>(data: T) {
  return { data, error: undefined };
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(<PlexConnectPanel />, { wrapper });
}

function writeText(): ReturnType<typeof vi.fn> {
  const spy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: spy },
    configurable: true,
  });
  return spy;
}

beforeEach(() => {
  vi.clearAllMocks();
  plexGetPlexUsernameMock.mockResolvedValue(ok({ data: null }));
  plexGetAuthPinMock.mockResolvedValue(ok({ data: { id: 42, code: '1234', clientId: 'cid' } }));
  plexCheckAuthPinMock.mockResolvedValue(ok({ data: { connected: false } }));
  plexDisconnectMock.mockResolvedValue(ok({ message: 'ok' }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PlexConnectPanel', () => {
  it('shows the connected username and a disconnect control when a token is already stored', async () => {
    plexGetPlexUsernameMock.mockResolvedValue(ok({ data: 'ada' }));
    renderPanel();

    expect(await screen.findByText('ada')).toBeInTheDocument();
    expect(screen.getByTestId('plex-connect-disconnect')).toBeInTheDocument();
    expect(screen.queryByTestId('plex-connect-start')).not.toBeInTheDocument();
  });

  it('requests a PIN and shows the code with a link to plex.tv/link', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByTestId('plex-connect-start'));

    expect(await screen.findByTestId('plex-connect-code')).toHaveTextContent('1234');
    expect(screen.getByTestId('plex-connect-waiting')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /plex\.tv\/link/i })).toHaveAttribute(
      'href',
      'https://plex.tv/link'
    );
    expect(plexGetAuthPinMock).toHaveBeenCalledTimes(1);
  });

  it('copies the code to the clipboard', async () => {
    // `userEvent.setup()` installs its own `navigator.clipboard` stub, so the
    // spy has to replace it afterwards to be the one the panel calls.
    const user = userEvent.setup();
    const spy = writeText();
    renderPanel();

    await user.click(await screen.findByTestId('plex-connect-start'));
    await user.click(await screen.findByTestId('plex-connect-copy'));

    expect(spy).toHaveBeenCalledWith('1234');
  });

  it('polls the PIN and swaps to the connected identity once plex.tv authorises it', async () => {
    const user = userEvent.setup();
    plexCheckAuthPinMock
      .mockResolvedValueOnce(ok({ data: { connected: false } }))
      .mockResolvedValue(ok({ data: { connected: true, username: 'ada' } }));
    renderPanel();

    await user.click(await screen.findByTestId('plex-connect-start'));
    await screen.findByTestId('plex-connect-code');

    plexGetPlexUsernameMock.mockResolvedValue(ok({ data: 'ada' }));

    expect(await screen.findByText('ada', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByTestId('plex-connect-code')).not.toBeInTheDocument();
    expect(plexCheckAuthPinMock).toHaveBeenCalledWith({ body: { id: 42 } });
  }, 15000);

  it('prompts for a retry instead of hanging when the PIN expires', async () => {
    const user = userEvent.setup();
    plexCheckAuthPinMock.mockResolvedValue(ok({ data: { connected: false, expired: true } }));
    renderPanel();

    await user.click(await screen.findByTestId('plex-connect-start'));

    expect(
      await screen.findByTestId('plex-connect-expired', {}, { timeout: 8000 })
    ).toHaveTextContent(/expired/i);
    expect(screen.getByTestId('plex-connect-start')).toHaveTextContent('Get a new code');
    expect(screen.queryByTestId('plex-connect-waiting')).not.toBeInTheDocument();
  }, 15000);

  it('stops polling once the PIN settles', async () => {
    const user = userEvent.setup();
    plexCheckAuthPinMock.mockResolvedValue(ok({ data: { connected: false, expired: true } }));
    renderPanel();

    await user.click(await screen.findByTestId('plex-connect-start'));
    await screen.findByTestId('plex-connect-expired', {}, { timeout: 8000 });

    const callsAtSettle = plexCheckAuthPinMock.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(plexCheckAuthPinMock.mock.calls.length).toBe(callsAtSettle);
  }, 15000);

  it('clears the stored account when disconnect is pressed', async () => {
    // First read finds the stored account; the refetch the disconnect
    // triggers finds it gone.
    plexGetPlexUsernameMock
      .mockResolvedValueOnce(ok({ data: 'ada' }))
      .mockResolvedValue(ok({ data: null }));
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByTestId('plex-connect-disconnect'));

    await waitFor(() => expect(plexDisconnectMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('plex-connect-start')).toBeInTheDocument();
    expect(screen.queryByText('ada')).not.toBeInTheDocument();
  });

  it('surfaces a failed PIN request rather than silently staying idle', async () => {
    plexGetAuthPinMock.mockResolvedValue({
      data: undefined,
      error: { message: 'Failed to create a Plex PIN (status 502)' },
      response: { status: 502 } as Response,
    });
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByTestId('plex-connect-start'));

    expect(await screen.findByTestId('plex-connect-error')).toHaveTextContent(
      'Failed to create a Plex PIN (status 502)'
    );
    expect(screen.queryByTestId('plex-connect-code')).not.toBeInTheDocument();
  });
});
