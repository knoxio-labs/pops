import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const readMock = vi.hoisted(() => vi.fn());
const writeMock = vi.hoisted(() => vi.fn());
vi.mock('../../../../bfm-api/index.js', () => ({
  operatorGetDeviceGrant: readMock,
  operatorReplaceDeviceGrant: writeMock,
}));

import { DevicePermissionsDialog } from '../DevicePermissionsDialog';
import { useDevicePermissions } from '../useDevicePermissions';
import { DEVICE, grant } from './grant-fixtures';

function Editor() {
  const editor = useDevicePermissions();
  return (
    <>
      <button onClick={(event) => editor.request(DEVICE, event.currentTarget)}>Permissions</button>
      <DevicePermissionsDialog editor={editor} />
    </>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  readMock.mockResolvedValue({ data: grant() });
});

async function open() {
  const user = userEvent.setup();
  render(<Editor />);
  const opener = screen.getByRole('button', { name: 'Permissions' });
  await user.click(opener);
  await screen.findByRole('checkbox', { name: /purchases.read/ });
  return { user, opener, dialog: screen.getByRole('dialog') };
}

describe('contextual permission editor', () => {
  it('resets cancelled choices, restores the originating button, and fresh-reads on reopen', async () => {
    const { user, opener, dialog } = await open();
    await user.click(within(dialog).getByRole('checkbox', { name: /purchases.read/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(opener).toHaveFocus());
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('checkbox', { name: /purchases.read/ })).toBeChecked();
    expect(readMock).toHaveBeenCalledTimes(2);
    expect(writeMock).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(opener).toHaveFocus());
  });
  it('keeps unsupported stored values visible and blocks a complete replacement', async () => {
    readMock.mockResolvedValue({ data: grant({ stored: ['future.example.read'] }) });
    const { dialog } = await open();
    const unknown = within(dialog).getByRole('checkbox', { name: /future.example.read/ });
    expect(unknown).toBeChecked();
    expect(unknown).toBeDisabled();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('future.example.read');
    expect(within(dialog).getByRole('button', { name: 'Save permissions' })).toBeDisabled();
    expect(writeMock).not.toHaveBeenCalled();
  });
  it('keeps an uncertain write draft locked until an explicit discard-and-read, never replaying', async () => {
    writeMock.mockResolvedValue({ error: new TypeError('Network failed') });
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole('checkbox', { name: /documents.upload/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Save permissions' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Save not confirmed');
    expect(within(dialog).getByRole('checkbox', { name: /documents.upload/ })).toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Save permissions' })).toBeDisabled();
    expect(readMock).toHaveBeenCalledTimes(1);
    await user.click(
      within(dialog).getByRole('button', { name: 'Discard selection and reload permissions' })
    );
    await waitFor(() =>
      expect(within(dialog).getByRole('checkbox', { name: /documents.upload/ })).not.toBeChecked()
    );
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(readMock).toHaveBeenCalledTimes(2);
  });
  it('does not close or duplicate a save while the request is on the wire', async () => {
    let complete: ((value: { data: ReturnType<typeof grant> }) => void) | undefined;
    writeMock.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      })
    );
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole('checkbox', { name: /documents.upload/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Save permissions' }));
    await user.keyboard('{Escape}');
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(dialog).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await act(async () => {
      complete?.({ data: grant({ revision: 5 }) });
    });
    expect(within(dialog).getByRole('status')).toHaveTextContent('Permissions saved.');
    expect(writeMock).toHaveBeenCalledTimes(1);
  });
  it.each([{ subjectEmail: 'guest@example.test' }, { revokedAt: '2026-01-02T00:00:00Z' }])(
    'refuses a non-editable device without a request: %j',
    (override) => {
      const { result } = renderHook(useDevicePermissions);
      act(() =>
        result.current.request({ ...DEVICE, ...override }, document.createElement('button'))
      );
      expect(result.current.open).toBe(false);
      expect(readMock).not.toHaveBeenCalled();
    }
  );
});
