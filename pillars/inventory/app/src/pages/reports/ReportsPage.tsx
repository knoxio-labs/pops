import { useSearchParams } from 'react-router';

import { InsuranceReportPage } from '../InsuranceReportPage';
import { PagePlaceholder } from '../PagePlaceholder';
import { ReportDashboardPage } from '../ReportDashboardPage';
import { WarrantiesPage } from '../WarrantiesPage';

import type { ReactElement } from 'react';

/** Selects the report surface from the `tab` query parameter. */
export function ReportsPage(): ReactElement {
  const [searchParams] = useSearchParams();

  switch (searchParams.get('tab')) {
    case 'insurance':
      return <InsuranceReportPage />;
    case 'warranties':
      return <WarrantiesPage />;
    case 'values':
      return <PagePlaceholder title="Reports" />;
    case 'overview':
    default:
      return <ReportDashboardPage />;
  }
}
