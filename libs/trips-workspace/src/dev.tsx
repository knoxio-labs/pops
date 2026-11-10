import './dev.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

import { Button, TextInput } from '@pops/ui';

import { CalendarWorkspace, StayWorkspace } from './index';

import type { JSX } from 'react';

const cache = new QueryClient();

function DevelopmentWorkspace(): JSX.Element {
  const [identity, setIdentity] = useState<{ tripId: number; stayId: number }>();
  const calendarId = /^\/calendar\/([1-9]\d*)$/u.exec(window.location.pathname)?.[1];
  return (
    <QueryClientProvider client={cache}>
      {calendarId ? (
        <CalendarWorkspace
          tripId={Number(calendarId)}
          locale={navigator.language}
          onOpenSource={({ kind, id }) => {
            const collection = { journey: 'journeys', stay: 'stays', event: 'events' }[kind];
            window.location.assign(`/trips/${calendarId}/${collection}/${id}`);
          }}
        />
      ) : (
        <>
          <form
            className="mx-auto flex max-w-5xl flex-wrap items-end gap-3 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setIdentity({
                tripId: Number(form.get('tripId')),
                stayId: Number(form.get('stayId')),
              });
            }}
          >
            <TextInput
              name="tripId"
              label="Trip ID"
              type="number"
              min="1"
              required
              className="min-h-11"
            />
            <TextInput
              name="stayId"
              label="Stay ID"
              type="number"
              min="1"
              required
              className="min-h-11"
            />
            <Button type="submit">Open workspace</Button>
          </form>
          {identity && <StayWorkspace {...identity} />}
        </>
      )}
    </QueryClientProvider>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Development root is missing');
createRoot(root).render(<DevelopmentWorkspace />);
