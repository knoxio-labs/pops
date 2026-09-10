import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Autocomplete } from './Autocomplete';
import { TextInput } from './TextInput';

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

  it('gives the input back cmdk\u2019s own id when the caller\u2019s id goes away', () => {
    function Harness({ withId }: { withId: boolean }) {
      return <Autocomplete {...(withId ? { id: 'recipe-field' } : {})} suggestions={[]} value="" />;
    }
    const { rerender } = render(<Harness withId />);
    expect(screen.getByRole('combobox')).toHaveAttribute('id', 'recipe-field');

    rerender(<Harness withId={false} />);

    // Not merely "no longer recipe-field": a combobox with no id at all cannot
    // be pointed at, and two of them sharing a stale one is worse still.
    const id = screen.getByRole('combobox').getAttribute('id');
    expect(id).not.toBe('recipe-field');
    expect(id).toBeTruthy();
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

/**
 * The chrome and the empty line, both of which used to be decided for the
 * consumer (POPS-3294).
 *
 * `CommandInput`'s search layout — a magnifier and a bottom-rule-only box —
 * is wrong for a 128px unit field sitting between two fully-bordered
 * `TextInput`s, and "No results found." is wrong for a field where free text
 * is normal use rather than a failed search. The kit exposed neither choice.
 */
describe('Autocomplete — chrome and the empty line', () => {
  function wrapper(): HTMLElement {
    const input = screen.getByRole('combobox');
    const box = input.closest('div');
    if (box === null) throw new Error('no container around the field');
    return box;
  }

  it('wears the search chrome by default', () => {
    const { container } = render(<Autocomplete suggestions={[]} value="" />);

    expect(container.querySelector('[data-slot="command-input-wrapper"]')).not.toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('drops the magnifier and the search wrapper when asked for the bare chrome', () => {
    const { container } = render(<Autocomplete chrome="bare" suggestions={[]} value="" />);

    expect(container.querySelector('[data-slot="command-input-wrapper"]')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('gives the bare field the same container the kit gives a TextInput', () => {
    render(<Autocomplete chrome="bare" suggestions={[]} value="" />);
    const bare = wrapper().className;

    render(<TextInput aria-label="beside it" />);
    const textInput = screen.getByLabelText('beside it').closest('div');

    expect(textInput).not.toBeNull();
    expect(bare).toBe((textInput as HTMLElement).className);
  });

  it('says nothing at all when the empty message is suppressed', async () => {
    render(
      <Autocomplete emptyMessage={null} suggestions={[]} value="sachets" placeholder="unit" />
    );

    fireEvent.focus(screen.getByRole('combobox'));
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveAttribute('data-state', 'open'));

    expect(screen.queryByText(/no results/iu)).not.toBeInTheDocument();
  });

  it('still says something when it is not', async () => {
    render(<Autocomplete emptyMessage="Nothing here." suggestions={[]} value="x" />);

    fireEvent.focus(screen.getByRole('combobox'));

    expect(await screen.findByText('Nothing here.')).toBeInTheDocument();
  });
});
