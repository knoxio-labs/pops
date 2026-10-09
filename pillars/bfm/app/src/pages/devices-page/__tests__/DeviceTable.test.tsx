import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DeviceTable } from '../DeviceTable';

import type { DeviceListModel, PairedDevice } from '../useDevicesPageModel';

const TRUSTED_DEVICE: PairedDevice = {
  id: 'device-1',
  name: "Joao's iPhone",
  model: 'iPhone 17 Pro',
  createdAt: '2026-08-01T10:00:00.000Z',
  lastSeenAt: '2026-08-08T09:00:00.000Z',
  revokedAt: null,
  subjectEmail: null,
};

function readyList(...devices: PairedDevice[]): DeviceListModel {
  return { state: 'ready', failure: null, devices };
}

describe('DeviceTable', () => {
  it('renders a touch-sized device card with the revoke action below md', async () => {
    const user = userEvent.setup();
    const onRevoke = vi.fn();
    render(<DeviceTable list={readyList(TRUSTED_DEVICE)} onRevoke={onRevoke} />);

    const cards = screen.getByRole('list', { name: 'Devices' });
    expect(cards).toHaveClass('md:hidden');

    const card = within(cards).getByRole('listitem');
    expect(within(card).getByRole('heading', { level: 3, name: "Joao's iPhone" })).toBeVisible();
    expect(within(card).getByText('iPhone 17 Pro')).toBeVisible();
    expect(within(card).getByText('Operator')).toBeVisible();
    expect(within(card).getByText(/Paired:/)).toHaveTextContent('1 Aug 2026');
    expect(within(card).getByText(/Last seen:/)).toBeVisible();
    expect(within(card).getByText('Trusted')).toBeVisible();

    const revoke = within(card).getByRole('button', { name: "Revoke Joao's iPhone" });
    expect(revoke).toHaveClass('h-11', 'w-full');
    await user.click(revoke);
    expect(onRevoke).toHaveBeenCalledWith(TRUSTED_DEVICE);

    expect(screen.getByTestId('device-table')).toHaveClass('hidden', 'md:block');
  });

  it('shows a revoked device state without offering a second revoke action', () => {
    const revokedDevice: PairedDevice = {
      ...TRUSTED_DEVICE,
      revokedAt: '2026-08-07T08:00:00.000Z',
    };
    render(<DeviceTable list={readyList(revokedDevice)} onRevoke={vi.fn()} />);

    const card = within(screen.getByRole('list', { name: 'Devices' })).getByRole('listitem');
    expect(within(card).getByText(/Revoked/)).toBeVisible();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
  });
});
