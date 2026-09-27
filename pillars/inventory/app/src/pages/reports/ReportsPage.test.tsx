import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../InsuranceReportPage', () => ({
  InsuranceReportPage: () => <div>insurance report</div>,
}));
vi.mock('../ReportDashboardPage', () => ({
  ReportDashboardPage: () => <div>report dashboard</div>,
}));
vi.mock('../WarrantiesPage', () => ({
  WarrantiesPage: () => <div>warranties report</div>,
}));

import { ReportsPage } from './ReportsPage';

function renderReports(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/inventory/reports${search}`]}>
      <Routes>
        <Route path="/inventory/reports" element={<ReportsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ReportsPage', () => {
  it('renders the dashboard without a tab', () => {
    renderReports();
    expect(screen.getByText('report dashboard')).toBeInTheDocument();
  });

  it('renders the dashboard for an unknown tab', () => {
    renderReports('?tab=unknown');
    expect(screen.getByText('report dashboard')).toBeInTheDocument();
  });

  it('renders the insurance report for the insurance tab', () => {
    renderReports('?tab=insurance');
    expect(screen.getByText('insurance report')).toBeInTheDocument();
  });

  it('renders the warranties report for the warranties tab', () => {
    renderReports('?tab=warranties');
    expect(screen.getByText('warranties report')).toBeInTheDocument();
  });

  it('renders the placeholder for the values tab', () => {
    renderReports('?tab=values');
    expect(screen.getByRole('heading', { name: 'Reports' })).toBeInTheDocument();
    expect(screen.getByText('This page is being built.')).toBeInTheDocument();
  });
});
