import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RecentSearches } from './RecentSearches';

describe('RecentSearches', () => {
  it('renders nothing when queries is empty', () => {
    const { container } = render(
      <RecentSearches queries={[]} onSelect={vi.fn()} onClear={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders recent queries', () => {
    render(
      <RecentSearches queries={['matrix', 'inception']} onSelect={vi.fn()} onClear={vi.fn()} />
    );
    expect(screen.getByText('matrix')).toBeInTheDocument();
    expect(screen.getByText('inception')).toBeInTheDocument();
    expect(screen.getByText('Recent searches')).toBeInTheDocument();
  });

  it('calls onSelect when a query is clicked', () => {
    const onSelect = vi.fn();
    render(<RecentSearches queries={['matrix']} onSelect={onSelect} onClear={vi.fn()} />);
    fireEvent.click(screen.getByTestId('recent-query-matrix'));
    expect(onSelect).toHaveBeenCalledWith('matrix');
  });

  it('calls onClear when clear button is clicked', () => {
    const onClear = vi.fn();
    render(<RecentSearches queries={['matrix']} onSelect={vi.fn()} onClear={onClear} />);
    fireEvent.click(screen.getByTestId('clear-recent'));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('renders clear recent button', () => {
    render(<RecentSearches queries={['matrix']} onSelect={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText('Clear recent')).toBeInTheDocument();
  });

  it('marks each row as an option with the shared id scheme and aria-selected', () => {
    render(
      <RecentSearches
        queries={['matrix', 'inception']}
        onSelect={vi.fn()}
        onClear={vi.fn()}
        selectedIndex={1}
      />
    );
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('id', 'search-option-0');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(options[1]).toHaveAttribute('id', 'search-option-1');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('defaults to no selection when selectedIndex is omitted', () => {
    render(<RecentSearches queries={['matrix']} onSelect={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'false');
  });

  it('wraps its header and options in a group, so a wrapping listbox owns no bare non-option child', () => {
    render(
      <div role="listbox" aria-label="Recent searches">
        <RecentSearches queries={['matrix', 'inception']} onSelect={vi.fn()} onClear={vi.fn()} />
      </div>
    );

    const listbox = screen.getByRole('listbox');
    const group = screen.getByRole('group');
    expect(listbox).toContainElement(group);
    // The listbox's only direct child is the group — not the "Clear recent"
    // button or the header label sitting bare alongside the option rows.
    expect(group.parentElement).toBe(listbox);
    expect(listbox.children).toHaveLength(1);
    expect(listbox.children[0]).toBe(group);

    const clearButton = screen.getByTestId('clear-recent');
    expect(group).toContainElement(clearButton);
    expect(clearButton).not.toHaveAttribute('role', 'option');

    const header = screen.getByText('Recent searches');
    expect(group).toHaveAttribute('aria-labelledby', header.id);
    expect(header.id).toBeTruthy();

    for (const option of screen.getAllByRole('option')) {
      expect(group).toContainElement(option);
    }
  });
});
