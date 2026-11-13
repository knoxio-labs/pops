import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { captureOwner } from './capture-context-fixture';
import { CaptureContext } from './CaptureContext';
import enAU from './locales/en-AU.json';
import { TimelineContext } from './TimelineContext';

import type { TimelineSelection } from './TimelineContext';

let owner: Awaited<ReturnType<typeof captureOwner>>;
const translation = createInstance();
beforeEach(async () => {
  owner = await captureOwner();
  await translation.init({ lng: 'en-AU', resources: { 'en-AU': { trips: enAU } } });
});
afterEach(async () => {
  cleanup();
  await owner.close();
});

function Host() {
  const [selection, onSelect] = useState<TimelineSelection | null>(null);
  const [tripId, setTripId] = useState(7);
  return (
    <>
      <main>
        <h1>Timeline {tripId}</h1>
        <button onClick={() => setTripId(tripId === 7 ? 8 : 7)}>Change Trip</button>
        {(['capture', 'inbox', 'explore'] as const).map((tool) => (
          <button key={tool} onClick={() => onSelect({ kind: 'tool', tool })}>
            Open {tool}
          </button>
        ))}
      </main>
      <TimelineContext
        tripId={tripId}
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

it('retains verbatim draft and distinct Files through actual contextual sheets and Trip changes', async () => {
  const user = userEvent.setup();
  const view = mount();
  await user.click(screen.getByRole('button', { name: 'Open capture' }));
  await user.type(
    await screen.findByRole('textbox', { name: 'Capture text' }),
    '  Raw 東京\nsource  '
  );
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('Missing file selection');
  await user.upload(input, [new File(['one'], 'same.txt'), new File(['two'], 'same.txt')]);
  expect(await screen.findAllByRole('region', { name: 'Upload same.txt' })).toHaveLength(2);
  await user.click(screen.getByRole('button', { name: 'Close' }));
  await user.click(screen.getByRole('button', { name: 'Open inbox' }));
  expect(await screen.findByRole('textbox', { name: 'Capture text' })).toHaveValue(
    '  Raw 東京\nsource  '
  );
  expect(screen.getAllByRole('region', { name: 'Upload same.txt' })).toHaveLength(2);
  await user.click(screen.getByRole('button', { name: 'Close' }));
  await user.click(screen.getByRole('button', { name: 'Change Trip' }));
  await user.click(screen.getByRole('button', { name: 'Open capture' }));
  expect(await screen.findByRole('textbox', { name: 'Capture text' })).toHaveValue('');
  expect(screen.queryByRole('region', { name: 'Upload same.txt' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Close' }));
  await user.click(screen.getByRole('button', { name: 'Change Trip' }));
  view.unmount();
  mount();
  await user.click(screen.getByRole('button', { name: 'Open explore' }));
  expect(await screen.findByRole('textbox', { name: 'Save possibility' })).toHaveValue(
    '  Raw 東京\nsource  '
  );
  expect(screen.getAllByRole('region', { name: 'Upload same.txt' })).toHaveLength(2);
  expect(owner.requests.filter(({ method }) => method === 'POST')).toEqual([]);
});

it('retries the exact unknown command after closing and reopening a different controlled tool', async () => {
  const user = userEvent.setup();
  owner.loseNextWrite();
  mount();
  await user.click(screen.getByRole('button', { name: 'Open capture' }));
  await user.type(await screen.findByRole('textbox', { name: 'Capture text' }), ' Raw command 🧭 ');
  await user.click(screen.getByRole('button', { name: 'Capture' }));
  expect(await screen.findByRole('button', { name: 'Retry Capture' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Close' }));
  await user.click(screen.getByRole('button', { name: 'Open inbox' }));
  await user.click(await screen.findByRole('button', { name: 'Retry Capture' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Retry Capture' })).not.toBeInTheDocument()
  );
  const posts = owner.requests.filter(({ method }) => method === 'POST');
  expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual(posts[0]);
});

function InlineCaptureHost() {
  const [selection, onSelect] = useState<TimelineSelection | null>(null);
  return (
    <>
      <button type="button" onClick={() => onSelect({ kind: 'tool', tool: 'capture' })}>
        Open full Capture
      </button>
      {selection === null && (
        <CaptureContext
          tripId={7}
          client={owner.client}
          documentsClient={owner.client}
          view="capture"
          compact
        />
      )}
      <TimelineContext
        tripId={7}
        client={owner.client}
        documentsClient={owner.client}
        selection={selection}
        onSelect={onSelect}
        workspace
      />
    </>
  );
}

it('retains one exact unknown command when moving between inline and contextual Capture', async () => {
  const user = userEvent.setup();
  render(
    <I18nextProvider i18n={translation}>
      <QueryClientProvider client={owner.cache}>
        <InlineCaptureHost />
      </QueryClientProvider>
    </I18nextProvider>
  );
  await user.type(
    await screen.findByRole('textbox', { name: 'Capture text' }),
    'Original inline draft 東京'
  );
  expect(screen.getByRole('button', { name: 'Choose existing document' })).not.toHaveClass(
    'size-32'
  );
  owner.loseNextWrite();
  await user.click(screen.getByRole('button', { name: 'Capture' }));
  await screen.findByRole('button', { name: 'Retry Capture' });
  await user.click(screen.getByRole('button', { name: 'Open full Capture' }));
  expect(await screen.findByRole('textbox', { name: 'Capture text' })).toHaveValue(
    'Original inline draft 東京'
  );
  expect(screen.getAllByRole('textbox', { name: 'Capture text' })).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Close' }));
  await user.click(await screen.findByRole('button', { name: 'Retry Capture' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Retry Capture' })).not.toBeInTheDocument()
  );
  const posts = owner.requests.filter(({ method }) => method === 'POST');
  expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual(posts[0]);
});

it('opens the canonical desktop context in a nonmodal rail with its existing Close action', async () => {
  document.documentElement.style.setProperty('--breakpoint-xl', '80rem');
  vi.stubGlobal('matchMedia', (query: string): MediaQueryList => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
  }));
  try {
    render(
      <I18nextProvider i18n={translation}>
        <QueryClientProvider client={owner.cache}>
          <InlineCaptureHost />
        </QueryClientProvider>
      </I18nextProvider>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open full Capture' }));
    expect(await screen.findByRole('textbox', { name: 'Capture text' })).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(await screen.findByRole('textbox', { name: 'Capture text' })).toBeVisible();
  } finally {
    document.documentElement.style.removeProperty('--breakpoint-xl');
    vi.unstubAllGlobals();
  }
});
