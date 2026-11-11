import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it } from 'vitest';

import enAU from './locales/en-AU.json';
import { timelineSourceOwner } from './timeline-source-fixture';
import { TimelineContext } from './TimelineContext';

import type { TimelineSelection } from './TimelineContext';

let owner: ReturnType<typeof timelineSourceOwner>;
const translation = createInstance();
beforeEach(async () => {
  owner = timelineSourceOwner();
  await translation.init({ lng: 'en-AU', resources: { 'en-AU': { trips: enAU } } });
});
afterEach(() => {
  cleanup();
  owner.cache.clear();
  expect(owner.unexpected).toEqual([]);
});

function Host() {
  const [selection, onSelect] = useState<TimelineSelection | null>(null);
  return (
    <>
      <main>
        <h1>Timeline</h1>
        <button onClick={() => onSelect({ kind: 'source', source: { kind: 'stay', id: 13 } })}>
          Open stay
        </button>
      </main>
      <TimelineContext
        tripId={7}
        client={owner.client}
        documentsClient={owner.client}
        selection={selection}
        onSelect={onSelect}
      />
    </>
  );
}
function mount() {
  return render(
    <I18nextProvider i18n={translation}>
      <QueryClientProvider client={owner.cache}>
        <Host />
      </QueryClientProvider>
    </I18nextProvider>
  );
}
async function reopen() {
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open stay' }));
  return screen.findByRole('textbox', { name: 'Stay name' });
}

it('retains the canonical unsaved source draft when its contextual sheet closes and reopens', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Open stay' }));
  fireEvent.change(await screen.findByRole('textbox', { name: 'Stay name' }), {
    target: { value: 'Uncommitted source name' },
  });
  expect(await reopen()).toHaveValue('Uncommitted source name');
  expect(owner.patches).toEqual([]);
});

it('retains failed exact source intent and successful Undo across contextual sheet remounts', async () => {
  owner.loseNextWrite();
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Open stay' }));
  const field = await screen.findByRole('textbox', { name: 'Stay name' });
  fireEvent.change(field, { target: { value: 'Failed source name' } });
  fireEvent.blur(field);
  expect(await screen.findByText('Changes have not been saved')).toBeVisible();
  expect(await reopen()).toHaveValue('Failed source name');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(owner.patches).toHaveLength(2));
  expect(owner.patches[1]).toEqual(owner.patches[0]);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled());
  await reopen();
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() => expect(owner.patches).toHaveLength(3));
  expect(owner.patches[2]).toEqual({
    name: 'Original stay',
    kind: null,
    status: null,
    visitId: null,
    timing: {},
    address: null,
    reference: null,
    notes: '',
    sourceLinks: [],
    hostLinks: [],
    documentLinks: [],
  });
});
