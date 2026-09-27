import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { coreWorld } from '../test-fixtures/core';
import { drill, hdmiCables } from '../test-fixtures/core-items';
import { coreLocations } from '../test-fixtures/core-locations';
import { PurchaseResultRow } from './purchase-result-row';
import { ItemResultRow, PlaceResultRow, RowFrame } from './result-rows';
import { ScopeChip } from './scope-chip';

import type { PurchaseHit } from '../../inventory-web/purchase-model';
import type { SearchItemHit, SearchPlaceHit } from '../../inventory-web/useWebSearch';

function itemHit(overrides: Partial<SearchItemHit> = {}): SearchItemHit {
  return {
    kind: 'item',
    item: hdmiCables,
    tier: 'prefix',
    field: null,
    ...overrides,
  };
}

function placeHit(): SearchPlaceHit {
  const place = coreLocations.find((location) => location.id === 'loc-house');
  if (place === undefined) throw new Error('Missing house fixture');
  return { kind: 'place', place, tier: 'prefix' };
}

function purchaseHit(overrides: Partial<PurchaseHit> = {}): PurchaseHit {
  return {
    id: 'purchase-1',
    merchant: 'Kmart',
    orderNumber: null,
    date: '2026-09-12T12:00:00.000Z',
    totalCents: 1400,
    currency: 'AUD',
    matchedLine: 'Cable organiser, 3 pack',
    ...overrides,
  };
}

describe('RowFrame', () => {
  it('carries its id and aria-selected and a click activates it', () => {
    const onActivate = vi.fn();
    const { rerender } = render(
      <RowFrame id="result-1" active label="Result" onActivate={onActivate}>
        Result
      </RowFrame>
    );

    const row = screen.getByRole('option', { name: 'Result' });
    expect(row).toHaveAttribute('id', 'result-1');
    expect(row).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(row);
    expect(onActivate).toHaveBeenCalledOnce();

    rerender(
      <RowFrame active={false} label="Other result">
        Other result
      </RowFrame>
    );
    const other = screen.getByRole('option', { name: 'Other result' });
    expect(other).not.toHaveAttribute('id');
    expect(other).toHaveAttribute('aria-selected', 'false');
  });
});

describe('ScopeChip', () => {
  it('shows its count only when not null and reports its scope', () => {
    const onScope = vi.fn();
    const { rerender } = render(<ScopeChip id="inventory" count={null} active onScope={onScope} />);
    const chip = screen.getByRole('radio', { name: 'Inventory' });
    expect(chip).toHaveAttribute('aria-checked', 'true');
    expect(chip).not.toHaveTextContent('3');

    rerender(<ScopeChip id="inventory" count={3} active={false} onScope={onScope} />);
    const countedChip = screen.getByRole('radio', { name: 'Inventory3' });
    expect(countedChip).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(countedChip);
    expect(onScope).toHaveBeenCalledWith('inventory');
  });
});

describe('ItemResultRow', () => {
  it('highlights a name match and names the field for another match', () => {
    const { rerender } = render(
      <ItemResultRow
        hit={itemHit()}
        query="hdmi"
        world={coreWorld}
        active={false}
        selected={false}
      />
    );
    expect(screen.getByText('HDMI')).toContainHTML('<mark');

    rerender(
      <ItemResultRow
        hit={itemHit({ item: drill, field: 'code', tier: 'other' })}
        query="d01"
        world={coreWorld}
        active={false}
        selected={false}
      />
    );
    expect(screen.getByText('Code matches')).toBeInTheDocument();
    expect(screen.queryByText('D01', { selector: 'mark' })).not.toBeInTheDocument();
  });

  it('toggles with shift and does not activate the row', () => {
    const onToggle = vi.fn();
    const onActivate = vi.fn();
    render(
      <ItemResultRow
        id="item-result"
        hit={itemHit()}
        query="hdmi"
        world={coreWorld}
        active={false}
        selected={false}
        onToggle={onToggle}
        onActivate={onActivate}
      />
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select HDMI cable 2 m' }), {
      shiftKey: true,
    });
    expect(onToggle).toHaveBeenCalledWith('itm-hdmi', true);
    expect(onActivate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('option', { name: 'HDMI cable 2 m' }));
    expect(onActivate).toHaveBeenCalledWith('itm-hdmi');
  });
});

describe('PlaceResultRow', () => {
  it('shows Top level and the count only when given', () => {
    const { rerender } = render(
      <PlaceResultRow hit={placeHit()} query="house" path="" holds={null} active={false} />
    );
    expect(screen.getByText('Top level')).toBeInTheDocument();
    expect(screen.queryByText(/here$/)).not.toBeInTheDocument();

    rerender(
      <PlaceResultRow hit={placeHit()} query="house" path="Garage" holds={4} active={false} />
    );
    expect(screen.getByText('Garage')).toBeInTheDocument();
    expect(screen.getByText('4 here')).toBeInTheDocument();
  });
});

describe('PurchaseResultRow', () => {
  it('shows the matched line and leaves out a missing order number', () => {
    render(
      <PurchaseResultRow id="purchase-result" hit={purchaseHit()} query="cable" active={false} />
    );

    expect(screen.getByRole('option', { name: 'Kmart' })).toBeInTheDocument();
    expect(screen.getByRole('option')).toHaveTextContent('Cable organiser, 3 pack');
    expect(screen.getByText('Kmart · 12 Sept 2026')).toBeInTheDocument();
    expect(screen.queryByText(/null/)).not.toBeInTheDocument();
  });
});
