import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { ArrangementResponsibilityField, ArrangementResponsibilityProvider } from '../index';
import { routeJson } from '../route/test-utils';
import { createClient } from '../trips-api/client';
import { labels } from './test-utils';

import type { ArrangementResponsibility, ArrangementTarget } from '../index';

afterEach(cleanup);
describe('Public contextual responsibility controls', () => {
  it.each(['journey', 'stay', 'event', 'rental'] satisfies ArrangementTarget['targetKind'][])(
    'edits only the selected whole %s and clears an unresolved Contact without its owner',
    async (targetKind) => {
      let source: ArrangementResponsibility = {
        tripId: 7,
        targetKind,
        targetId: 61,
        responsibility: { kind: 'contact', uri: 'pops:contacts/contact/retained' },
        revision: 4,
      };
      const requests: Request[] = [];
      const bodies: unknown[] = [];
      const client = createClient({
        baseUrl: 'http://responsibility.test',
        fetch: async (input, init) => {
          const request = new Request(input, init);
          requests.push(request);
          if (request.method === 'PUT') {
            bodies.push(await request.json());
            source = {
              ...source,
              revision: source.revision + 1,
              responsibility: bodies.length === 1 ? null : { kind: 'self' },
            };
          }
          return routeJson(source);
        },
      });
      const identity = { tripId: 7, client, labels };
      const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={cache}>
          <ArrangementResponsibilityProvider identity={identity}>
            <ArrangementResponsibilityField
              identity={identity}
              target={{ targetKind, targetId: 61 }}
            />
          </ArrangementResponsibilityProvider>
        </QueryClientProvider>
      );
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: labels.clear }));
      await waitFor(() => expect(screen.getByText(labels.unset)).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: labels.self }));
      await waitFor(() => expect(bodies).toHaveLength(2));
      expect(bodies).toEqual([
        { expectedRevision: 4, responsibility: null },
        { expectedRevision: 5, responsibility: { kind: 'self' } },
      ]);
      expect(
        requests.every(
          (request) =>
            new URL(request.url).pathname === `/trips/7/responsibilities/${targetKind}/61`
        )
      ).toBe(true);
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: labels.chooseContact })).not.toBeInTheDocument();
    }
  );
});
