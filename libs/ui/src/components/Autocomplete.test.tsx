import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Autocomplete } from './Autocomplete';

describe('Autocomplete — loading suppresses the empty message', () => {
  it('does not render the empty message while loading, even with no suggestions', async () => {
    render(
      <Autocomplete suggestions={[]} value="chick" loading emptyMessage="No results found." />
    );

    fireEvent.focus(screen.getByRole('combobox'));
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveAttribute('data-state', 'open'));

    expect(screen.queryByText('No results found.')).not.toBeInTheDocument();
  });

  it('renders the empty message once loading is false and suggestions are still empty', async () => {
    render(
      <Autocomplete
        suggestions={[]}
        value="chick"
        loading={false}
        emptyMessage="No results found."
      />
    );

    fireEvent.focus(screen.getByRole('combobox'));
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveAttribute('data-state', 'open'));

    expect(await screen.findByText('No results found.')).toBeInTheDocument();
  });
});
