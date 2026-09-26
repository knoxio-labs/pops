import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { LocationContentsPanel } from './LocationContentsPanel';

import type { ReactElement } from 'react';

import type { LocationTreeNode } from './location-contents-panel-data';

const dataMocks = vi.hoisted(() => ({ useLocationItems: vi.fn() }));
vi.mock('./location-contents-panel-data', async () => {
  const actual = await vi.importActual<typeof import('./location-contents-panel-data')>(
    './location-contents-panel-data'
  );
  return { ...actual, useLocationItems: dataMocks.useLocationItems };
});

function LocationProbe(): ReactElement {
  return <output data-testid="location">{useLocation().pathname + useLocation().search}</output>;
}

const node: LocationTreeNode = {
  id: 'garage',
  name: 'Garage',
  parentId: null,
  sortOrder: 0,
  children: [],
};

describe('LocationContentsPanel', () => {
  it('opens the new model form with the location in the query', () => {
    dataMocks.useLocationItems.mockReturnValue({
      allItems: [],
      isLoading: false,
      hasSubLocations: false,
    });
    render(
      <MemoryRouter initialEntries={['/inventory/locations/garage']}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <LocationContentsPanel
                  locationId="garage"
                  locationName="Garage"
                  breadcrumb={['Home']}
                  node={node}
                />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Item Here' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/inventory/items/new?in=garage');
  });
});
