import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { ChipInput, type ChipInputSuggestion } from './ChipInput';

const SUGGESTIONS: ChipInputSuggestion[] = [
  { label: 'React', value: 'react' },
  { label: 'Redux', value: 'redux' },
  { label: 'Retired', value: 'retired', disabled: true },
];

function ControlledChipInput({
  suggestions = SUGGESTIONS,
  normalize,
}: {
  suggestions?: ChipInputSuggestion[];
  normalize?: (raw: string) => string;
}) {
  const [values, setValues] = useState<string[]>([]);
  return (
    <ChipInput
      aria-label="Tags"
      value={values}
      onChange={setValues}
      suggestions={suggestions}
      normalize={normalize}
    />
  );
}

describe('ChipInput — suggestions', () => {
  it('opens on focus, moves the highlight with arrow keys, and commits the highlighted suggestion on Enter — using real keyboard events, no click', async () => {
    const user = userEvent.setup();
    render(<ControlledChipInput />);

    const input = screen.getByRole('combobox', { name: 'Tags' });
    await user.click(input);
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

    // First item ("React") is highlighted by default; move to the second.
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(await screen.findByText('redux')).toBeInTheDocument();
    expect(screen.queryByText('react')).not.toBeInTheDocument();
  });

  it('commits the first suggestion on Enter when no arrow key moved the highlight', async () => {
    // Contrast case for the test above: without the ArrowDown keypress,
    // Enter lands on whatever cmdk highlights by default (the first item),
    // never "redux" — proving the prior assertion is actually driven by the
    // arrow-key event, not by Enter alone always resolving to "redux".
    const user = userEvent.setup();
    render(<ControlledChipInput />);

    const input = screen.getByRole('combobox', { name: 'Tags' });
    await user.click(input);
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

    await user.keyboard('{Enter}');

    expect(await screen.findByText('react')).toBeInTheDocument();
    expect(screen.queryByText('redux')).not.toBeInTheDocument();
  });

  it('does not offer a disabled suggestion to arrow-navigate onto', async () => {
    const user = userEvent.setup();
    render(<ControlledChipInput />);

    const input = screen.getByRole('combobox', { name: 'Tags' });
    await user.click(input);
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

    // Only two selectable items exist (React, Redux); running ArrowDown past
    // the end must clamp on the last selectable item, never land on the
    // disabled "Retired" entry.
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');

    expect(await screen.findByText('redux')).toBeInTheDocument();
    expect(screen.queryByText('retired')).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<ControlledChipInput />);

    const input = screen.getByRole('combobox', { name: 'Tags' });
    await user.click(input);
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('closes when clicking outside', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <ControlledChipInput />
        <button type="button">outside</button>
      </div>
    );

    const input = screen.getByRole('combobox', { name: 'Tags' });
    await user.click(input);
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'outside' }));

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('commits an arbitrary typed value as a chip when it matches no suggestion', async () => {
    const user = userEvent.setup();
    render(<ControlledChipInput />);

    const input = screen.getByRole('combobox', { name: 'Tags' });
    await user.click(input);
    await user.type(input, 'graphql{Enter}');

    expect(await screen.findByText('graphql')).toBeInTheDocument();
  });

  it('applies the normalisation hook when committing a free-text value', async () => {
    const user = userEvent.setup();
    render(
      <ControlledChipInput normalize={(raw) => raw.trim().toLowerCase().replace(/\s+/g, '-')} />
    );

    const input = screen.getByRole('combobox', { name: 'Tags' });
    await user.click(input);
    await user.type(input, '  Server Side Rendering{Enter}');

    expect(await screen.findByText('server-side-rendering')).toBeInTheDocument();
  });

  it('applies the normalisation hook when committing a picked suggestion', async () => {
    const user = userEvent.setup();
    render(
      <ControlledChipInput
        suggestions={[{ label: 'React', value: 'React' }]}
        normalize={(raw) => raw.trim().toLowerCase()}
      />
    );

    const input = screen.getByRole('combobox', { name: 'Tags' });
    await user.click(input);
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    await user.keyboard('{Enter}');

    expect(await screen.findByText('react')).toBeInTheDocument();
  });

  it('shows the empty-state message when nothing matches the typed text', async () => {
    const user = userEvent.setup();
    render(<ControlledChipInput />);

    const input = screen.getByRole('combobox', { name: 'Tags' });
    await user.click(input);
    await user.type(input, 'nothing-matches-this');

    expect(await screen.findByText('No matching suggestions.')).toBeInTheDocument();
  });

  it('carries combobox semantics on the input and option semantics on the list', async () => {
    const user = userEvent.setup();
    render(<ControlledChipInput />);

    const input = screen.getByRole('combobox', { name: 'Tags' });
    await user.click(input);

    const listbox = await screen.findByRole('listbox');
    expect(listbox).toBeInTheDocument();
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
  });
});
