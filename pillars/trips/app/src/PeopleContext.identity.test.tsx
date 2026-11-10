import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { PeopleContext } from './PeopleContext';
import { createClient } from './trips-api/client';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);

it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
  'rejects invalid contextual owning identity %s before source transport',
  (tripId) => {
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error('Unexpected source read'));
    const client = createClient({ baseUrl: 'http://localhost/trips-api', fetch: transport });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PeopleContext tripId={tripId} client={client} />
      </QueryClientProvider>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('people.invalid');
    expect(transport).not.toHaveBeenCalled();
  }
);
