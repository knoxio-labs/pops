import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ShortcutProvider } from '../../foundation/shortcuts/shortcut-provider.js';
import { busyLedgerResponse } from '../../foundation/test-fixtures/sync.js';
import { SyncPage } from './SyncPage.js';

import type { ReactElement } from 'react';

import type { SyncLedgerApi } from '../../inventory-web/useSyncLedger.js';

const iphoneReport = busyLedgerResponse.devices.find((device) => device.id === 'dev-iphone');
if (iphoneReport === undefined) throw new Error('sync fixture is incomplete');

const mocks = vi.hoisted(() => ({
  useSyncLedger: vi.fn(),
  useOnline: vi.fn(),
  reload: vi.fn(),
}));

vi.mock('../../inventory-web/useSyncLedger.js', () => ({ useSyncLedger: mocks.useSyncLedger }));
vi.mock('../../inventory-web/useOnline.js', () => ({ useOnline: mocks.useOnline }));
vi.mock('./activity/activity-segment.js', () => ({
  ActivitySegment: ({ disabledReason }: { disabledReason?: string }) => (
    <div data-testid="activity-segment" data-disabled-reason={disabledReason}>
      Activity
    </div>
  ),
}));

function LocationText(): ReactElement {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function responseWith(overrides: Partial<SyncLedgerApi> = {}): SyncLedgerApi {
  return {
    ledger: busyLedgerResponse,
    status: 'success',
    error: null,
    reportedSince: [],
    stale: false,
    reload: mocks.reload,
    ...overrides,
  };
}

function renderSync(initialEntry = '/inventory/sync'): void {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ShortcutProvider globalHandlers={{}}>
        <Routes>
          <Route
            path="/inventory/sync"
            element={
              <>
                <SyncPage />
                <LocationText />
              </>
            }
          />
        </Routes>
      </ShortcutProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.useSyncLedger.mockReturnValue(responseWith());
  mocks.useOnline.mockReturnValue(true);
});

describe('SyncPage', () => {
  it('the top segments switch between Activity and the ledger and write segment', async () => {
    renderSync();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Activity' }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/inventory/sync?segment=activity')
    );
    expect(screen.getByTestId('activity-segment')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: /^Sync/ }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/inventory/sync')
    );
    expect(screen.getByText('Small parts case')).toBeInTheDocument();
  });

  it('leaving Activity clears its owned URL filters', async () => {
    renderSync(
      '/inventory/sync?segment=activity&kind=edits&actor=web&q=lamp&from=2026-09-01&to=2026-09-02'
    );

    fireEvent.mouseDown(screen.getByRole('tab', { name: /^Sync/ }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/inventory/sync')
    );
  });

  it('the list segments write segment and show their counts', async () => {
    renderSync();

    expect(screen.getByRole('tab', { name: /Needs attention/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Waiting/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Resolved/ })).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: /^Waiting/ }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/inventory/sync?segment=waiting')
    );
  });

  it('Review writes case and Open case on a waiting row opens its case', async () => {
    renderSync();

    fireEvent.click(
      screen.getByRole('button', { name: 'Review Small parts case: T02 is already on Cable tub' })
    );
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/inventory/sync?case=case-parts-code'
      )
    );

    cleanup();
    renderSync('/inventory/sync?segment=waiting');
    fireEvent.click(screen.getByRole('button', { name: 'Open case' }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/inventory/sync?case=case-hdmi-shielding'
      )
    );
  });

  it('all clear shows when nothing needs attention', () => {
    mocks.useSyncLedger.mockReturnValue(
      responseWith({
        ledger: {
          ...busyLedgerResponse,
          attention: [],
          waiting: [],
          attentionCount: 0,
        },
      })
    );
    renderSync();

    expect(screen.getByText('Nothing needs a decision')).toBeInTheDocument();
    expect(
      screen.getByText(/Every change from Joao's iPhone and Joao's iPad was saved/)
    ).toBeInTheDocument();
  });

  it('stale names the phone and keeps the lists until Reload', () => {
    const reload = vi.fn();
    mocks.useSyncLedger.mockReturnValue(
      responseWith({
        reportedSince: [
          {
            device: iphoneReport,
            changeCount: 2,
          },
        ],
        stale: true,
        reload,
      })
    );
    renderSync();

    expect(
      screen.getByText("Joao's iPhone reported 2 changes since this loaded.")
    ).toBeInTheDocument();
    expect(screen.getByText('Small parts case')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('offline shows the banner and passes the offline reason to Activity', () => {
    mocks.useOnline.mockReturnValue(false);
    renderSync('/inventory/sync?segment=activity');

    expect(screen.getByText('No connection. Showing what loaded.')).toBeInTheDocument();
    expect(
      screen.getByText('Web actions and Undo are off until the connection is back.')
    ).toBeInTheDocument();
    expect(screen.getByTestId('activity-segment')).toHaveAttribute(
      'data-disabled-reason',
      'No connection. Changes are off until it is back.'
    );
  });

  it('a pending ledger shows the skeleton and a failed one Retry', () => {
    mocks.useSyncLedger.mockReturnValue(responseWith({ ledger: undefined, status: 'pending' }));
    renderSync();
    expect(screen.getByLabelText('Loading sync')).toBeInTheDocument();

    cleanup();
    const reload = vi.fn();
    mocks.useSyncLedger.mockReturnValue(
      responseWith({ ledger: undefined, status: 'error', reload })
    );
    renderSync();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('resolved shows an empty state when no case was recently resolved', () => {
    mocks.useSyncLedger.mockReturnValue(
      responseWith({
        ledger: { ...busyLedgerResponse, resolved: [] },
      })
    );
    renderSync('/inventory/sync?segment=resolved');

    expect(screen.getByText('No recently resolved cases')).toBeInTheDocument();
  });
});
