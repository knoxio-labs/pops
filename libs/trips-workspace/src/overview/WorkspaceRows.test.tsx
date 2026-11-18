import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { labels as responsibilityLabels } from '../arrangements/test-utils';
import { mountOverview } from './render.test-utils';
import { overviewResponses, sourceEvent } from './test-utils';

import type { ContactReferenceReadResult, ContactsHostCapability } from '@pops/pillar-sdk';

afterEach(cleanup);

it('uses exact existing document identities in the owning row without fetching metadata for every chip', async () => {
  const responses = overviewResponses();
  responses.set('/trips/7/document-associations', {
    associations: [
      {
        id: 71,
        tripId: 7,
        documentId: 901,
        targetKind: 'stay',
        targetId: 13,
        createdAt: '2029-01-01T00:00:00Z',
      },
      {
        id: 72,
        tripId: 7,
        documentId: 902,
        targetKind: 'event',
        targetId: 61,
        createdAt: '2029-01-01T00:00:00Z',
      },
    ],
  });
  const onOpenSource = vi.fn();
  const { requests } = mountOverview(responses, undefined, { onOpenSource });
  const stay = await screen.findByRole('button', { name: 'Cedar guesthouse' });
  const stayRow = sourceRow(stay);
  expect(await within(stayRow).findByText('document #901')).toBeVisible();
  expect(within(stayRow).queryByText('document #902')).not.toBeInTheDocument();
  await userEvent.click(stay);
  expect(onOpenSource).toHaveBeenCalledWith({ kind: 'stay', id: 13 });
  expect(requests.every((path) => !path.startsWith('/documents'))).toBe(true);
});

it('retains separate leg status axes and does not infer a Journey purchase from a Booked event', async () => {
  mountOverview();
  const event = await screen.findByRole('link', { name: /Harbour festival/ });
  const eventRow = sourceRow(event);
  expect(within(eventRow).getByText('Alternative')).toBeVisible();
  expect(within(eventRow).getByText('Booked')).toBeVisible();
  expect(eventRow).toHaveAttribute('data-constraint', 'soft');
  const journey = await screen.findByRole('link', { name: /Harbour connection/ });
  const journeyRow = sourceRow(journey);
  expect(journeyRow).toHaveAttribute('data-constraint', 'soft');
  expect(within(journeyRow).queryByText('Purchased')).not.toBeInTheDocument();
});

it('shows only recorded responsibility and resolves Contact names through the host capability', async () => {
  const responses = overviewResponses();
  const uri = 'pops:contacts/contact/recorded-owner';
  responses.set('/trips/7/events', {
    events: [sourceEvent(), sourceEvent({ id: 62, name: 'Unassigned picnic' })],
  });
  responses.set('/trips/7/responsibilities', {
    responsibilities: [
      {
        tripId: 7,
        targetKind: 'stay',
        targetId: 13,
        responsibility: { kind: 'self' },
        revision: 1,
      },
      {
        tripId: 7,
        targetKind: 'event',
        targetId: 61,
        responsibility: { kind: 'contact', uri },
        revision: 2,
      },
    ],
  });
  const resolved: ContactReferenceReadResult = {
    status: 'available',
    name: 'Maya · host',
    href: '/contacts/owner-issued',
    reference: { canonicalId: 'owner-issued', uri: 'pops:contacts/contact/owner-issued' },
  };
  const read = vi
    .fn<NonNullable<ContactsHostCapability['readContactReference']>>()
    .mockResolvedValue(resolved);
  const createIntent = vi.fn(() => ({ Chooser: () => null }));
  const { requests } = mountOverview(responses, undefined, {
    responsibility: {
      labels: responsibilityLabels,
      contacts: { createIntent, readContactReference: read },
    },
  });

  const stay = sourceRow(await screen.findByRole('link', { name: 'Cedar guesthouse' }));
  expect(within(stay).getByText('Self')).toBeVisible();
  const event = sourceRow(await screen.findByRole('link', { name: /Harbour festival/ }));
  expect(await within(event).findByRole('link', { name: 'Maya · host' })).toHaveAttribute(
    'href',
    '/contacts/owner-issued'
  );
  expect(read).toHaveBeenCalledExactlyOnceWith(uri, { signal: expect.any(AbortSignal) });
  expect(createIntent).not.toHaveBeenCalled();
  expect(requests).toContain('/trips/7/responsibilities');
  const sheet = screen.getByRole('table', { name: 'Sheet' });
  const unassigned = sourceRow(within(sheet).getByRole('link', { name: 'Unassigned picnic' }));
  expect(within(unassigned).getByText('Unassigned')).toBeVisible();
});

it('does not describe an unavailable responsibility read as unassigned', async () => {
  const responses = overviewResponses();
  responses.delete('/trips/7/responsibilities');
  mountOverview(responses);

  const stay = sourceRow(await screen.findByRole('link', { name: 'Cedar guesthouse' }));
  expect(within(stay).getByText('Not loaded')).toBeVisible();
  expect(within(stay).queryByText('Unassigned')).not.toBeInTheDocument();
});

function sourceRow(source: HTMLElement): HTMLElement {
  const row = source.closest('tr, article');
  if (!(row instanceof HTMLElement)) throw new Error('Expected a route source container');
  return row;
}
