import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { CaptureBrowserSession } from './browser-session';
import { CaptureContactReference } from './CaptureContactReference';
import { captureSource, deferred } from './test-utils';

import type { ContactReferenceReadResult } from '@pops/pillar-sdk';

afterEach(cleanup);
const uri = 'pops:contacts/contact/old-id';
const available: ContactReferenceReadResult = {
  status: 'available',
  name: 'Owner supplied name',
  href: '/contacts/actual-id',
  reference: { canonicalId: 'actual-id', uri: 'pops:contacts/contact/actual-id' },
};

function setup(readContactReference: (uri: string) => Promise<ContactReferenceReadResult>) {
  const perform = vi.fn();
  const session = new CaptureBrowserSession(captureSource(), 1, perform, {
    createIntent: () => ({ Chooser: () => null }),
    readContactReference,
  });
  return { session, perform };
}

it.each([
  ['missing', 'Contact is missing.'],
  ['unavailable', 'Contacts is unavailable.'],
  ['readError', 'Contact could not be read.'],
] as const)(
  'displays %s without a guessed link, then retries the owner read without a Trips mutation',
  async (status, message) => {
    const read = vi
      .fn<(uri: string) => Promise<ContactReferenceReadResult>>()
      .mockResolvedValueOnce({ status })
      .mockResolvedValueOnce(available);
    const { session, perform } = setup(read);
    const reference = { uri, label: 'Retained label' };
    render(<CaptureContactReference session={session} reference={reference} />);
    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.getByText('Retained label')).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(read).toHaveBeenCalledExactlyOnceWith(uri);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry Contact read' }));
    const link = await screen.findByRole('link', { name: 'Owner supplied name' });
    expect(link).toHaveAttribute('href', '/contacts/actual-id');
    expect(link.closest('[title]')).toHaveAttribute('title', uri);
    expect(reference).toEqual({ uri, label: 'Retained label' });
    expect(read).toHaveBeenCalledTimes(2);
    expect(perform).not.toHaveBeenCalled();
    expect(session.editor.getState().confirmation).toBeNull();
  }
);

it('does not deliver a late result into a different reference and retains both results through remount', async () => {
  const gate = deferred<ContactReferenceReadResult>();
  const read = vi.fn(async (value: string) => (value === uri ? gate.promise : available));
  const { session } = setup(read);
  const view = render(<CaptureContactReference session={session} reference={{ uri }} />);
  await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
  view.rerender(
    <CaptureContactReference
      session={session}
      reference={{ uri: 'pops:contacts/contact/second' }}
    />
  );
  expect(await screen.findByRole('link', { name: 'Owner supplied name' })).toBeVisible();
  gate.resolve({ status: 'missing' });
  await waitFor(() => expect(session.contactReads.snapshot(uri)).toEqual({ status: 'missing' }));
  expect(screen.queryByText('Contact is missing.')).not.toBeInTheDocument();
  view.unmount();
  render(<CaptureContactReference session={session} reference={{ uri }} />);
  expect(screen.getByText('Contact is missing.')).toBeVisible();
  expect(read).toHaveBeenCalledTimes(2);
});

it('retains legitimate prior owner display facts after failed refresh without presenting them as currently available', async () => {
  const read = vi
    .fn<(uri: string) => Promise<ContactReferenceReadResult>>()
    .mockResolvedValueOnce(available)
    .mockResolvedValueOnce({ status: 'unavailable', reference: available.reference });
  const { session, perform } = setup(read);
  render(
    <CaptureContactReference session={session} reference={{ uri, label: 'Older retained label' }} />
  );
  expect(await screen.findByRole('link', { name: 'Owner supplied name' })).toBeVisible();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh Contact' }));
  expect(await screen.findByText('Contacts is unavailable.')).toBeVisible();
  expect(screen.getByText('Owner supplied name')).toBeVisible();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(session.contactReads.snapshot(uri)).toEqual({
    status: 'unavailable',
    reference: available.reference,
  });
  expect(session.contactReads.availability(uri)).toBe('unverified');
  expect(perform).not.toHaveBeenCalled();
});
