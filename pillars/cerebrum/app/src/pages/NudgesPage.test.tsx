import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const nudgesListMock = vi.hoisted(() => vi.fn());

vi.mock('../cerebrum-api', () => ({
  nudgesAct: vi.fn(),
  nudgesDismiss: vi.fn(),
  nudgesList: nudgesListMock,
}));

import { NudgesPage } from './NudgesPage';

describe('NudgesPage', () => {
  it('renders the API error code when loading fails', async () => {
    nudgesListMock.mockResolvedValue({
      error: {
        code: 'cerebrum.nudges.unavailable',
        message: 'Nudges unavailable',
        requestId: 'req-nudges',
        retryable: true,
      },
      response: { status: 503 },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <NudgesPage />
      </QueryClientProvider>
    );

    expect(await screen.findByLabelText('Error code')).toHaveTextContent(
      'cerebrum.nudges.unavailable'
    );
  });
});
