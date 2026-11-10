import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { EventReferences } from './EventReferences';
import { eventTransport, sourceEvent } from './test-utils';
import { useEventEditor } from './use-event-editor';

import type { EventWorkspaceProps, TripEvent } from './types';

afterEach(cleanup);
function References({ initial, identity }: { initial: TripEvent; identity: EventWorkspaceProps }) {
  const editor = useEventEditor(initial, identity);
  return (
    <EventReferences
      event={editor.draft}
      drafts={editor.referenceDrafts}
      commit={(patch) => void editor.commit(patch)}
    />
  );
}

it('retains each unsubmitted reference composer across close, cache eviction and reopen', () => {
  const initial = sourceEvent();
  const transport = eventTransport();
  const cache = new QueryClient();
  const identity = { client: transport.client, tripId: 7, eventId: 19 };
  const mount = () =>
    render(
      <QueryClientProvider client={cache}>
        <References initial={initial} identity={identity} />
      </QueryClientProvider>
    );
  const first = mount();
  for (const label of ['Sources', 'Venue references', 'Document references']) {
    fireEvent.change(screen.getByLabelText(`${label} URI`), {
      target: { value: `opaque:${label}` },
    });
    fireEvent.change(screen.getByLabelText(`${label} label`), {
      target: { value: `Unsubmitted ${label}` },
    });
  }
  first.unmount();
  cache.clear();
  mount();
  for (const label of ['Sources', 'Venue references', 'Document references']) {
    expect(screen.getByLabelText(`${label} URI`)).toHaveValue(`opaque:${label}`);
    expect(screen.getByLabelText(`${label} label`)).toHaveValue(`Unsubmitted ${label}`);
  }
  expect(transport.patches).toEqual([]);
});
