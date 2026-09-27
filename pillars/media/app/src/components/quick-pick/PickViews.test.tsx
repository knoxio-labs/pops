import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { MediaApiError } from '../../media-api-helpers.js';
import { ErrorView } from './PickViews';

describe('quick-pick ErrorView', () => {
  it('renders the ADR-054 error code', () => {
    render(
      <MemoryRouter>
        <ErrorView
          error={
            new MediaApiError({
              code: 'media.discovery.quick_pick_unavailable',
              kind: 'server',
              message: 'Quick picks unavailable',
              requestId: 'req-picks',
              retryable: true,
              status: 503,
            })
          }
        />
      </MemoryRouter>
    );

    expect(screen.getByLabelText('Error code')).toHaveTextContent(
      'media.discovery.quick_pick_unavailable'
    );
  });
});
