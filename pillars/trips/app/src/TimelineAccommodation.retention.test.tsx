import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { unwrap } from '@pops/pillar-sdk/client';
import { AccommodationGapProvider } from '@pops/trips-workspace';

import enAU from './locales/en-AU.json';
import { timelineProducer } from './timeline-producer-fixture';
import { TimelineAccommodation } from './TimelineAccommodation';
import { placesCreate, staysList, visitsCreate } from './trips-api/sdk.gen';
import { useTimelineSelection } from './use-timeline-selection';

let owner: Awaited<ReturnType<typeof timelineProducer>>;
let cache: QueryClient;
let visitId: number;
const translation = createInstance();
beforeEach(async () => {
  owner = await timelineProducer();
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await translation.init({ lng: 'en-AU', resources: { 'en-AU': { trips: enAU } } });
  const place = unwrap(await placesCreate({ client: owner.client, body: { name: 'Gap visit' } }));
  const visit = unwrap(
    await visitsCreate({
      client: owner.client,
      path: { tripId: owner.tripId },
      body: { placeId: place.id, timing: { arrival: '2030-04-10', departure: '2030-04-13' } },
    })
  );
  visitId = visit.id;
  owner.requests.length = 0;
}, 60_000);
afterEach(async () => {
  cleanup();
  cache?.clear();
  await owner?.close();
});

function ContextHost({ tick }: { tick: number }) {
  const { selection, onSelect } = useTimelineSelection(owner.client);
  return (
    <>
      <span>{tick}</span>
      <output aria-label="Selected context">
        {selection ? JSON.stringify(selection) : 'none'}
      </output>
      <button onClick={() => onSelect({ kind: 'tool', tool: 'people' })}>Choose people</button>
      <button onClick={() => onSelect(null)}>Close context</button>
      <TimelineAccommodation
        tripId={owner.tripId}
        visitId={visitId}
        client={owner.client}
        onSelect={onSelect}
      />
    </>
  );
}
function host(tick: number) {
  return (
    <I18nextProvider i18n={translation}>
      <QueryClientProvider client={cache}>
        <AccommodationGapProvider identity={{ tripId: owner.tripId, client: owner.client }}>
          <ContextHost tick={tick} />
        </AccommodationGapProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
async function committedStay() {
  const result = unwrap(await staysList({ client: owner.client, path: { tripId: owner.tripId } }));
  const [stay] = result.stays;
  if (!stay) throw new Error('Expected the real committed Stay');
  return stay;
}
function creates() {
  return owner.requests.filter(({ method }) => method === 'POST');
}

it.each([false, true])(
  'opens the real acknowledged Stay after unrelated parent rerender=%s',
  async (rerender) => {
    const held = owner.holdNextStayCreate();
    expect(() => owner.holdNextStayCreate()).toThrow('already held');
    try {
      const view = render(host(0));
      fireEvent.click(await screen.findByRole('button', { name: /Add stay/ }));
      await held.committed;
      const saved = await committedStay();
      expect(screen.getByLabelText('Selected context')).toHaveTextContent('none');
      if (rerender) view.rerender(host(1));
      await act(async () => held.release());
      await waitFor(() =>
        expect(screen.getByLabelText('Selected context')).toHaveTextContent(
          JSON.stringify({ kind: 'source', source: { kind: 'stay', id: saved.id } })
        )
      );
      expect(creates()).toEqual([
        {
          method: 'POST',
          path: `/trips/${owner.tripId}/stays`,
          body: { visitId, timing: { arrival: '2030-04-10', departure: '2030-04-13' } },
        },
      ]);
      expect(screen.queryByRole('button', { name: /Add stay/ })).not.toBeInTheDocument();
    } finally {
      held.release();
    }
  },
  60_000
);

it.each(['people', 'close', 'ABA'] as const)(
  'settles the actual Stay without replacing a newer %s selection',
  async (choice) => {
    const held = owner.holdNextStayCreate();
    try {
      render(host(0));
      fireEvent.click(await screen.findByRole('button', { name: /Add stay/ }));
      await held.committed;
      const saved = await committedStay();
      if (choice !== 'close')
        fireEvent.click(screen.getByRole('button', { name: 'Choose people' }));
      if (choice !== 'people')
        fireEvent.click(screen.getByRole('button', { name: 'Close context' }));
      await act(async () => held.release());
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: /Add stay/ })).not.toBeInTheDocument()
      );
      expect(screen.getByLabelText('Selected context')).toHaveTextContent(
        choice === 'people' ? JSON.stringify({ kind: 'tool', tool: 'people' }) : 'none'
      );
      expect((await committedStay()).id).toBe(saved.id);
      expect(creates()).toHaveLength(1);
    } finally {
      held.release();
    }
  },
  60_000
);
