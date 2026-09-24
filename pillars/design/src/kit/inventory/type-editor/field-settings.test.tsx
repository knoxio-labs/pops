import { cataloguePrimitiveDefinitions } from '@/fixtures/inventory-type-primitives';
import { states } from '@/screens/inventory/type-editor';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);

function renderState(name: string) {
  const State = states[name];
  if (State === undefined) throw new Error(`Missing state ${name}`);
  return render(<State />);
}

function checkbox(name: string) {
  return screen.getByRole('checkbox', { name });
}

describe('type-editor primitive states', () => {
  it.each(cataloguePrimitiveDefinitions.map((definition) => [definition.kind, definition]))(
    'renders %s in its own state with its value rule',
    (kind, definition) => {
      renderState(`primitive-${kind.replaceAll('_', '-')}`);
      expect(screen.getByText(new RegExp(`^${definition.contract}\\.`, 'u'))).toBeInTheDocument();
    }
  );

  it('keeps short and long text limits distinct', () => {
    renderState('primitive-short-text');
    expect(screen.getByText(/^1 to 200 characters\./u)).toBeInTheDocument();
    expect(screen.queryByText(/20,000/u)).toBeNull();
  });

  it('locks yes / no cardinality to one', () => {
    renderState('primitive-boolean');
    expect(screen.getByRole('radio', { name: 'One' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Many' })).toBeDisabled();
    expect(screen.getByText('Yes / no fields always store one value.')).toBeInTheDocument();
  });

  it("shows the field's own cardinality", () => {
    renderState('primitive-enum');
    expect(screen.getByRole('radio', { name: 'Many' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Many' })).toBeEnabled();
  });

  it('offers restore for an archived option and archive for active ones', () => {
    renderState('primitive-enum');
    expect(screen.getByRole('button', { name: /Restore/u })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive USB-C' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive Lightning' })).toBeNull();
  });

  it('shows the fixed unit and its dimension for a measurement', () => {
    renderState('primitive-measurement');
    expect(screen.getByLabelText('Fixed unit')).toHaveValue('kg');
    expect(screen.getByText('mass')).toBeInTheDocument();
  });
});

describe('type-editor reference states', () => {
  it('configures an item-only reference with an item-type constraint', () => {
    renderState('reference-targets');
    expect(screen.getByText('Accepts Electronics items.')).toBeInTheDocument();
    expect(checkbox('Inventory item')).toBeChecked();
    expect(checkbox('Location')).not.toBeChecked();
    expect(checkbox('Electronics')).toBeChecked();
    expect(checkbox('Furniture')).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Many' })).toBeChecked();
  });

  it('configures a mixed item and location reference', () => {
    renderState('reference-items-and-locations');
    expect(screen.getByText('Accepts Furniture items or any location.')).toBeInTheDocument();
    expect(checkbox('Inventory item')).toBeChecked();
    expect(checkbox('Location')).toBeChecked();
    expect(checkbox('Furniture')).toBeChecked();
    expect(screen.getByText(/Types never limit locations\./u)).toBeInTheDocument();
  });

  it('configures a location-only reference without item types', () => {
    renderState('primitive-reference');
    expect(screen.getByText('Accepts any location.')).toBeInTheDocument();
    expect(checkbox('Inventory item')).not.toBeChecked();
    expect(checkbox('Location')).toBeChecked();
    expect(screen.queryByText('Allowed item types')).toBeNull();
  });
});
