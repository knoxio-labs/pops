import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { valuesGroup, valuesReport } from './reports-test-fixtures.js';
import { ValuesTab } from './values-tab.js';

import type { ComponentProps } from 'react';

function renderValues(
  overrides: Partial<ComponentProps<typeof ValuesTab>> = {}
): ReturnType<typeof render> {
  return render(
    <ValuesTab
      data={valuesReport()}
      status="ready"
      by="room"
      basis="replacement"
      groupKey={null}
      onByChange={vi.fn()}
      onBasisChange={vi.fn()}
      onGroupChange={vi.fn()}
      {...overrides}
    />
  );
}

describe('ValuesTab', () => {
  it('renders server totals, group shares, and entry values without recomputing them', () => {
    const first = valuesGroup({
      key: 'first',
      label: 'First group',
      records: 1,
      share: 0.25,
      value: 123,
      entries: [
        {
          code: null,
          isContainer: false,
          itemId: 'item-1',
          name: 'Server valued item',
          quantity: 2,
          typeKey: 'misc',
          unitValue: 10,
          value: 999,
        },
      ],
    });
    const second = valuesGroup({ key: 'second', label: 'Second group', records: 0, value: 0 });

    renderValues({
      data: valuesReport({
        groups: [first, second],
        totals: {
          purchase: 321,
          records: 1,
          replacement: 1234,
          units: 2,
          unvalued: 0,
          withoutPhoto: 0,
        },
      }),
    });

    expect(screen.getByText('$1,234')).toBeInTheDocument();
    expect(screen.getByText('$999')).toBeInTheDocument();
    expect(screen.queryByText('$20')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /group/ })[0]).toHaveTextContent('First group');
    expect(screen.getByText('Second group')).toBeInTheDocument();
  });

  it('forwards grouping, group selection, and item opening', () => {
    const onByChange = vi.fn();
    const onBasisChange = vi.fn();
    const onGroupChange = vi.fn();
    const onOpenItem = vi.fn();
    renderValues({
      onByChange,
      onBasisChange,
      onGroupChange,
      onOpenItem,
      data: valuesReport({
        groups: [
          valuesGroup({
            key: 'first',
            records: 1,
            entries: [
              {
                code: null,
                isContainer: false,
                itemId: 'item-1',
                name: 'Open me',
                quantity: 1,
                typeKey: null,
                unitValue: 25,
                value: 25,
              },
            ],
          }),
        ],
        totals: {
          purchase: 25,
          records: 1,
          replacement: 25,
          units: 1,
          unvalued: 0,
          withoutPhoto: 0,
        },
      }),
    });

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'By type' }));
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Price paid' }));
    fireEvent.click(screen.getByRole('button', { name: /Open Open me/ }));
    fireEvent.click(screen.getByText('Kitchen'));

    expect(onByChange).toHaveBeenCalledWith('type');
    expect(onBasisChange).toHaveBeenCalledWith('purchase');
    expect(onOpenItem).toHaveBeenCalledWith('item-1');
    expect(onGroupChange).toHaveBeenCalledWith('first');
  });

  it('renders loading, error, and empty states with the relevant controls', () => {
    renderValues({ status: 'loading' });
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.getByText('Rooms')).toBeInTheDocument();
    expect(screen.getByLabelText('Group by')).toBeInTheDocument();

    const onRetry = vi.fn();
    renderValues({ status: 'error', onRetry });
    expect(screen.getByText('Values did not load')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();

    renderValues({ data: valuesReport(), status: 'ready' });
    expect(screen.getByText('No values to break down')).toBeInTheDocument();
  });
});
