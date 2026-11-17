import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { mountOverview } from './render.test-utils';
import { overviewResponses } from './test-utils';

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

function sourceRow(source: HTMLElement): HTMLElement {
  const row = source.closest('tr, article');
  if (!(row instanceof HTMLElement)) throw new Error('Expected a route source container');
  return row;
}
