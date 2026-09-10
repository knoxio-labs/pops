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

/**
 * The accessible name, asserted through the name computation rather than
 * through `getByLabelText`.
 *
 * That distinction is the whole test. `getByLabelText` matches `aria-label`
 * directly and passed against the broken component, which is why nothing
 * caught that every `Autocomplete` in the repo was an unnamed combobox
 * (POPS-3282). `getByRole(..., { name })` runs the accname algorithm, where
 * cmdk's empty `aria-labelledby` target beat everything else.
 */
describe('Autocomplete — how it is named', () => {
  it('puts the caller’s id on the input, so a label can point at it', () => {
    render(<Autocomplete id="recipe-field" suggestions={[]} value="" />);

    expect(screen.getByRole('combobox')).toHaveAttribute('id', 'recipe-field');
  });

  it('computes its accessible name from aria-label', () => {
    render(<Autocomplete aria-label="Recipe" suggestions={[]} value="" />);

    expect(screen.getByRole('combobox', { name: 'Recipe' })).toBeInTheDocument();
  });

  it('computes its accessible name from a <label htmlFor> beside it', () => {
    render(
      <>
        <label htmlFor="recipe-field">Recipe</label>
        <Autocomplete id="recipe-field" suggestions={[]} value="" />
      </>
    );

    expect(screen.getByRole('combobox', { name: 'Recipe' })).toBeInTheDocument();
  });

  it('computes its accessible name from aria-labelledby', () => {
    render(
      <>
        <span id="recipe-heading">Recipe</span>
        <Autocomplete aria-labelledby="recipe-heading" suggestions={[]} value="" />
      </>
    );

    expect(screen.getByRole('combobox', { name: 'Recipe' })).toBeInTheDocument();
  });

  it('leaves cmdk to own the parts of the combobox it owns', () => {
    render(<Autocomplete aria-label="Recipe" suggestions={[]} value="" />);
    const input = screen.getByRole('combobox');

    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-controls');
  });
});
