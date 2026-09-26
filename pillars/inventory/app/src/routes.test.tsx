import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';

import { SearchPreservingRedirect } from './routes';

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderRedirect(from: string, to: string, set?: Readonly<Record<string, string>>): void {
  render(
    <MemoryRouter initialEntries={[from]}>
      <Routes>
        <Route
          path={new URL(from, 'https://pops.test').pathname}
          element={<SearchPreservingRedirect to={to} set={set} />}
        />
        <Route path="*" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('SearchPreservingRedirect', () => {
  it('redirects /inventory/warranties to the Warranties tab of Reports', () => {
    renderRedirect('/inventory/warranties?locationId=loc-123&tab=old', '/inventory/reports', {
      tab: 'warranties',
    });
    expect(screen.getByTestId('location').textContent).toBe(
      '/inventory/reports?tab=warranties&locationId=loc-123'
    );
  });

  it('redirects /inventory/activity to the Activity segment of Sync, keeping the query', () => {
    renderRedirect('/inventory/activity?cursor=next', '/inventory/sync', { segment: 'activity' });
    expect(screen.getByTestId('location').textContent).toBe(
      '/inventory/sync?segment=activity&cursor=next'
    );
  });

  it.each([
    '/inventory/reports/insurance?locationId=loc-123',
    '/inventory/report/insurance?locationId=loc-123',
  ])('redirects %s to the Insurance tab, keeping locationId', (from) => {
    renderRedirect(from, '/inventory/reports', { tab: 'insurance' });
    expect(screen.getByTestId('location').textContent).toBe(
      '/inventory/reports?tab=insurance&locationId=loc-123'
    );
  });

  it('replaces a set key instead of carrying the incoming value', () => {
    renderRedirect('/inventory/warranties?tab=old&locationId=loc-123', '/inventory/reports', {
      tab: 'warranties',
    });
    expect(screen.getByTestId('location').textContent).toBe(
      '/inventory/reports?tab=warranties&locationId=loc-123'
    );
  });

  it('redirects /inventory/report without adding a query', () => {
    renderRedirect('/inventory/report', '/inventory/reports');
    expect(screen.getByTestId('location').textContent).toBe('/inventory/reports');
  });

  it('preserves the incoming query on the legacy report redirect', () => {
    renderRedirect('/inventory/report?year=2024', '/inventory/reports');
    expect(screen.getByTestId('location').textContent).toBe('/inventory/reports?year=2024');
  });
});
