import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Box, MapPin, MoveRight } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CommandPalette, CommandPalettePanel } from './CommandPalette';
import { initialPaletteState } from './palette-state';

import type { PaletteCommand, PaletteSource } from './types';

afterEach(cleanup);

const first = {
  id: 'first-entry',
  label: 'First entry',
  group: 'records',
  icon: Box,
} satisfies PaletteCommand;
const second = {
  id: 'second-entry',
  label: 'Second entry',
  group: 'records',
  icon: MapPin,
} satisfies PaletteCommand;
const move = {
  id: 'move',
  label: 'Move',
  group: 'commands',
  icon: MoveRight,
  argument: 'destination',
} satisfies PaletteCommand;
const seeAll = {
  id: 'see-all',
  label: 'See all matches',
  group: 'search',
  icon: Box,
} satisfies PaletteCommand;

const baseSource: PaletteSource = {
  scopes: [
    { id: 'first', label: 'First' },
    { id: 'second', label: 'Second' },
  ],
  commands: [first, second, move],
  sections: (query) =>
    query.trim() === 'zzz' ? [] : [{ id: 'records', title: 'Records', entries: [first, second] }],
  seeAll: (query) => (query.trim() === '' ? null : seeAll),
  placeholder: () => 'Search commands',
};

function sourceWith(overrides: Partial<PaletteSource> = {}): PaletteSource {
  return { ...baseSource, ...overrides };
}

describe('CommandPalettePanel', () => {
  it('lists See all after the matches and hands over the trimmed query and scope', () => {
    const onSeeAll = vi.fn();
    const onClose = vi.fn();
    render(
      <CommandPalettePanel
        source={baseSource}
        initial={{ ...initialPaletteState('first'), query: '  ca  ' }}
        onSeeAll={onSeeAll}
        onClose={onClose}
      />
    );
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options.at(-1)).toContain('See all matches');
    fireEvent.click(screen.getByText('See all matches'));
    expect(onSeeAll).toHaveBeenCalledWith('ca', 'first');
    expect(onClose).toHaveBeenCalled();
  });

  it('still offers See all when no section matches', () => {
    render(
      <CommandPalettePanel
        source={baseSource}
        initial={{ ...initialPaletteState('first'), query: 'zzz' }}
      />
    );
    expect(screen.getByText('Nothing in First matches “zzz”.')).toBeInTheDocument();
    expect(screen.getByText('See all matches')).toBeInTheDocument();
  });

  it('renders no See all row when the source returns null', () => {
    render(
      <CommandPalettePanel
        source={sourceWith({ seeAll: () => null })}
        initial={{ ...initialPaletteState('first'), query: 'ca' }}
      />
    );
    expect(screen.queryByText('See all matches')).toBeNull();
  });

  it('moves from the last row of one group to the first row of the next with ArrowDown', () => {
    const source = sourceWith({
      sections: () => [
        { id: 'one', title: 'One', entries: [first] },
        { id: 'two', title: 'Two', entries: [second] },
      ],
      seeAll: () => null,
    });
    render(<CommandPalettePanel source={source} initialActiveId={first.id} />);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'Second entry' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('Mod+Enter opens the active row beside and does not run it', () => {
    const onOpenBeside = vi.fn();
    const onRun = vi.fn();
    render(
      <CommandPalettePanel
        source={sourceWith({ seeAll: () => null })}
        initialActiveId={first.id}
        onOpenBeside={onOpenBeside}
        onRun={onRun}
      />
    );
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter', metaKey: true });
    expect(onOpenBeside).toHaveBeenCalledWith(first);
    expect(onRun).not.toHaveBeenCalled();
  });

  it('renders renderHint output on each row', () => {
    render(
      <CommandPalettePanel
        source={sourceWith({ seeAll: () => null })}
        renderHint={(entry) => <span data-testid={`hint-${entry.id}`}>Hint</span>}
      />
    );
    expect(screen.getByTestId(`hint-${first.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`hint-${second.id}`)).toBeInTheDocument();
  });

  it('names the current and the next scope in the empty result', () => {
    render(
      <CommandPalettePanel
        source={baseSource}
        initial={{ ...initialPaletteState('first'), query: 'zzz' }}
      />
    );
    expect(screen.getByText('Nothing in First matches “zzz”.')).toBeInTheDocument();
    expect(screen.getByText(/Press.*to search Second\./u)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Tab' });
    expect(screen.getByText('Nothing in Second matches “zzz”.')).toBeInTheDocument();
    expect(screen.getByText(/Press.*to search First\./u)).toBeInTheDocument();
  });

  it('the dialog content carries md:p-0 so the palette is unpadded and 640px wide at md', () => {
    render(<CommandPalette source={baseSource} open onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('md:p-0', 'pt-[env(safe-area-inset-top)]');
    expect(dialog).not.toHaveClass('md:p-6');
  });

  it('calls onQueryChange on mount and after each query or scope change', () => {
    const onQueryChange = vi.fn();
    const { rerender } = render(
      <CommandPalettePanel source={baseSource} onQueryChange={onQueryChange} />
    );
    expect(onQueryChange).toHaveBeenLastCalledWith('', 'first');
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'ca' } });
    expect(onQueryChange).toHaveBeenLastCalledWith('ca', 'first');
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(onQueryChange).toHaveBeenLastCalledWith('ca', 'second');
    const calls = onQueryChange.mock.calls.length;
    rerender(
      <CommandPalettePanel
        source={sourceWith({ sections: () => [] })}
        onQueryChange={onQueryChange}
      />
    );
    expect(onQueryChange).toHaveBeenCalledTimes(calls);
  });

  it('a new source re-renders the sections and keeps the typed query', () => {
    const source = sourceWith({
      sections: () => [{ id: 'old', title: 'Old', entries: [first] }],
      seeAll: () => null,
    });
    const view = render(
      <CommandPalettePanel
        source={source}
        initial={{ ...initialPaletteState('first'), query: 'ca' }}
      />
    );
    const replacement = sourceWith({
      sections: () => [{ id: 'new', title: 'New', entries: [second] }],
      seeAll: () => null,
    });
    view.rerender(<CommandPalettePanel source={replacement} />);
    expect(screen.getByRole('combobox')).toHaveValue('ca');
    expect(screen.getByText('Second entry')).toBeInTheDocument();
    expect(screen.queryByText('First entry')).toBeNull();
    expect(screen.getByLabelText('Searching First')).toBeInTheDocument();
  });

  it('a pending status draws no empty copy', () => {
    const pending = sourceWith({
      sections: () => [],
      status: () => 'pending',
    });
    const ready = sourceWith({ sections: () => [] });
    const view = render(
      <CommandPalettePanel
        source={pending}
        initial={{ ...initialPaletteState('first'), query: 'ca' }}
      />
    );
    expect(screen.queryByText(/Nothing in/u)).toBeNull();
    view.rerender(
      <CommandPalettePanel
        source={ready}
        initial={{ ...initialPaletteState('first'), query: 'ca' }}
      />
    );
    expect(screen.getByText('Nothing in First matches “ca”.')).toBeInTheDocument();
  });

  it('an error status draws a line that is never active and no empty copy', () => {
    const errorSource = sourceWith({
      sections: () => [{ id: 'records', title: 'Records', entries: [first] }],
      status: () => ({ error: 'Search did not load.' }),
      seeAll: () => seeAll,
    });
    const onRun = vi.fn();
    const firstView = render(
      <CommandPalettePanel source={errorSource} initialActiveId={first.id} onRun={onRun} />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Search did not load.');
    expect(screen.queryByText(/Nothing in/u)).toBeNull();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'See all matches' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.queryByRole('option', { name: 'Search did not load.' })).toBeNull();
    firstView.unmount();
    render(<CommandPalettePanel source={errorSource} initialActiveId={first.id} onRun={onRun} />);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(onRun).toHaveBeenCalledWith(first, null);

    cleanup();
    render(
      <CommandPalettePanel
        source={sourceWith({ sections: () => [], status: () => ({ error: 'Failed' }) })}
        initial={{ ...initialPaletteState('first'), query: 'ca' }}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Failed');
    expect(screen.queryByText(/Nothing in/u)).toBeNull();
  });
});
