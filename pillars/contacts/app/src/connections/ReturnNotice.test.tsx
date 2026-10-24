import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { ReturnNotice } from './ReturnNotice';

describe('provider callback outcome', () => {
  it('offers a localized retry after cancellation without starting authorization again', () => {
    render(
      <MemoryRouter initialEntries={['/contacts/connections?connectionError=cancelled']}>
        <ReturnNotice />
      </MemoryRouter>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Google connection was cancelled');
    expect(screen.getByRole('alert')).toHaveTextContent('Open the Google card');
  });
  it('renders a fixed failure message without echoing callback parameters', () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/contacts/connections?connectionError=failed&detail=fictional-private-detail',
        ]}
      >
        <ReturnNotice />
      </MemoryRouter>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Google connection could not be completed');
    expect(screen.queryByText(/fictional-private-detail/)).not.toBeInTheDocument();
  });
  it('does not manufacture an error after success or for unknown query values', () => {
    render(
      <MemoryRouter initialEntries={['/contacts/connections?connectionError=unexpected']}>
        <ReturnNotice />
      </MemoryRouter>
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
