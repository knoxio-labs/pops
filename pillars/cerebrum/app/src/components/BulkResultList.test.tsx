import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { CerebrumApiError } from '../cerebrum-api-helpers';
import { BulkResultList } from './BulkResultList';

describe('BulkResultList', () => {
  it('renders the error code for a failed segment', () => {
    render(
      <MemoryRouter>
        <BulkResultList
          results={[
            {
              body: 'failed segment',
              error: new CerebrumApiError({
                code: 'cerebrum.ingest.capture_failed',
                kind: 'server',
                message: 'Capture failed',
                requestId: 'req-capture',
                retryable: true,
                status: 503,
              }),
              index: 0,
              preview: 'failed segment',
            },
          ]}
          isSubmitting={false}
          onReset={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByLabelText('Error code')).toHaveTextContent('cerebrum.ingest.capture_failed');
  });
});
