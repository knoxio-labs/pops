import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResponsibilityContactChooser } from './ResponsibilityContactChooser';
import { labels } from './test-utils';

import type { ContactChooserIntent, ContactChooserMountProps } from '@pops/pillar-sdk';

const target = { targetKind: 'rental', targetId: 61 } as const;
const selection = {
  name: 'Display name differs from identity',
  reference: { canonicalId: 'issued-id', uri: 'pops:contacts/contact/issued-id' },
};
const identity = { tripId: 7, labels, formatDate: (date: string): string => date };
afterEach(cleanup);
function setup() {
  const mounts: ContactChooserMountProps[] = [];
  const intent: ContactChooserIntent = {
    Chooser: (props) => {
      mounts.push(props);
      return props.open ? (
        <>
          <button onClick={() => props.onSelect(selection)}>Select issued choice</button>
          <button onClick={() => props.onOpenChange(false)}>Cancel picker</button>
        </>
      ) : null;
    },
  };
  const getIntent = vi.fn(() => intent);
  const select = vi.fn<(uri: string, intent: ContactChooserIntent) => void>();
  const view = render(
    <ResponsibilityContactChooser
      identity={{ ...identity, contactChooserIntent: getIntent }}
      target={target}
      disabled={false}
      select={select}
    />
  );
  return { ...view, mounts, getIntent, intent, select, user: userEvent.setup() };
}
describe('Responsibility owner picker boundary', () => {
  it('offers no fabricated picker without the host capability', () => {
    render(
      <ResponsibilityContactChooser
        identity={identity}
        target={target}
        disabled={false}
        select={vi.fn()}
      />
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('opens only the exact target intent and saves only the owner-issued URI once', async () => {
    const { getIntent, mounts, intent, select, user } = setup();
    expect(getIntent).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Choose contact' }));
    expect(getIntent).toHaveBeenCalledExactlyOnceWith(target);
    expect(select).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    const active = mounts.at(-1);
    await user.click(screen.getByRole('button', { name: 'Select issued choice' }));
    active?.onSelect(selection);
    expect(select).toHaveBeenCalledExactlyOnceWith(selection.reference.uri, intent);
    expect(screen.queryByRole('button', { name: 'Select issued choice' })).not.toBeInTheDocument();
  });
  it('retains the host intent on reopen while cancelled and unmounted views cannot write', async () => {
    const { mounts, select, getIntent, user, unmount } = setup();
    await user.click(screen.getByRole('button', { name: 'Choose contact' }));
    const cancelled = mounts.at(-1);
    await user.click(screen.getByRole('button', { name: 'Cancel picker' }));
    cancelled?.onSelect(selection);
    expect(select).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Choose contact' }));
    expect(getIntent).toHaveBeenCalledTimes(2);
    const active = mounts.at(-1);
    unmount();
    active?.onSelect(selection);
    expect(select).not.toHaveBeenCalled();
  });
});
