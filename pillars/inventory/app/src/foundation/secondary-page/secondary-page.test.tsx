import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SkeletonRows } from './list-parts.js';
import { PageStateBanner } from './page-states.js';
import { PickList } from './pick-list.js';

import type { ReactElement, ReactNode } from 'react';

describe('secondary page parts', () => {
  it('a refused pick option shows its reason and does not toggle', () => {
    const onToggle = vi.fn();
    render(
      <PickList
        label="Things to connect"
        options={[
          {
            key: 'fixture-1',
            mark: <span aria-hidden>F</span>,
            title: 'Power outlet',
            meta: 'Kitchen',
            refusal: 'Already connected to this item',
          },
        ]}
        selected={new Set()}
        query=""
        placeholder="Search fixtures"
        onToggle={onToggle}
      />
    );

    const option = screen.getByRole('option', { name: /Power outlet/ });
    expect(option).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Already connected to this item')).toBeInTheDocument();
    fireEvent.click(option);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('the stale banner names the time of the change and Reload calls onReload', () => {
    const onReload = vi.fn();
    const changedAt = new Date(Date.now() - 2 * 60_000).toISOString();
    render(
      <PageStateBanner
        banner="stale"
        what="Connections"
        changedAt={changedAt}
        onReload={onReload}
      />
    );

    expect(screen.getByText('Connections changed elsewhere 2m ago.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledOnce();
  });

  it('nothing matches shows the empty text', () => {
    render(
      <PickList
        label="Fixtures"
        options={[]}
        selected={new Set()}
        query="unused"
        placeholder="Search fixtures"
        empty="No fixtures match."
      />
    );

    expect(screen.getByText('No fixtures match.')).toBeInTheDocument();
  });

  it('a pick list body replaces the options and keeps the search field focused', () => {
    function PickListHarness({ body }: { body?: ReactNode }): ReactElement {
      const [query, setQuery] = useState('');
      return (
        <PickList
          label="Items"
          options={[
            {
              key: 'lamp',
              mark: <span aria-hidden>I</span>,
              title: 'Desk lamp',
              meta: 'Study',
            },
          ]}
          selected={new Set()}
          query={query}
          placeholder="Search items"
          onQueryChange={setQuery}
          body={body}
        />
      );
    }

    const { rerender } = render(<PickListHarness />);
    const input = screen.getByRole('textbox', { name: 'Search items' });
    input.focus();
    fireEvent.change(input, { target: { value: 'la' } });

    rerender(<PickListHarness body={<SkeletonRows />} />);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search items' })).toBe(input);
    expect(input).toHaveValue('la');
    expect(input).toHaveFocus();

    rerender(<PickListHarness />);
    expect(screen.getByRole('listbox', { name: 'Items' })).toBeInTheDocument();
    expect(screen.queryByText('Nothing matches.')).not.toBeInTheDocument();
  });
});
