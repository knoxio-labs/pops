import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { createClient as createDocumentsClient } from '../documents-api/client';
import { createClient } from '../trips-api/client';
import { SourceDialog } from './SourceDialog';
import { labels } from './test-utils';

import type { EventWorkspaceProps } from '../event/types';
import type { StayWorkspaceProps } from '../stay/types';

const mounted = vi.hoisted(() => ({
  stay: vi.fn<(props: StayWorkspaceProps) => void>(),
  event: vi.fn<(props: EventWorkspaceProps) => void>(),
}));
vi.mock('../stay/StayWorkspace', () => ({
  StayWorkspace: (props: StayWorkspaceProps) => {
    mounted.stay(props);
    return null;
  },
}));
vi.mock('../event/EventWorkspace', () => ({
  EventWorkspace: (props: EventWorkspaceProps) => {
    mounted.event(props);
    return null;
  },
}));
vi.mock('./Responsibility', () => ({ Responsibility: () => null }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it.each([
  ['stay', 13],
  ['event', 19],
] as const)(
  'passes actual host capabilities to the nested %s source editor',
  (targetKind, targetId) => {
    const cache = new QueryClient();
    const client = createClient({ baseUrl: 'http://trips.test' });
    const documentsClient = createDocumentsClient({ baseUrl: 'http://documents.test' });
    const contacts = { createIntent: vi.fn(() => ({ Chooser: () => null })) };
    render(
      <QueryClientProvider client={cache}>
        <SourceDialog
          target={{ targetKind, targetId }}
          identity={{
            tripId: 7,
            client,
            documentsClient,
            contacts,
            labels,
            formatDate: (date) => date,
          }}
          sources={{ legs: new Map() }}
          close={vi.fn()}
          viewJourney={vi.fn()}
        />
      </QueryClientProvider>
    );
    const props =
      targetKind === 'stay' ? mounted.stay.mock.calls[0]?.[0] : mounted.event.mock.calls[0]?.[0];
    expect(props).toMatchObject({ tripId: 7, client, contacts, documentsClient });
    expect(contacts.createIntent).not.toHaveBeenCalled();
    if (targetKind === 'stay')
      expect(mounted.stay.mock.calls[0]?.[0].formatNights(1)).toBe('1 night');
    cache.clear();
  }
);
