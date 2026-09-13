import {
  dashboardSummary,
  dashboardSummaryEmpty,
  valueByLocationBreakdown,
  valueByLocationBreakdownEmpty,
  valueByTypeBreakdown,
  valueByTypeBreakdownEmpty,
} from '@/fixtures/inventory-reports';
import { DashboardWidgets } from '@/kit/inventory/dashboard-widgets';
import { BarChart3, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button, PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { DashboardSummary } from '@/kit/inventory/dashboard-widgets';
import type { ValueBreakdownCardProps } from '@/kit/inventory/value-breakdown';

export const meta: ScreenMeta = { title: 'Reports dashboard', order: 1, frame: 'web' };

export interface ReportDashboardPageProps {
  data: DashboardSummary | null;
  isLoading?: boolean;
  valueByType: ValueBreakdownCardProps;
  valueByLocation: ValueBreakdownCardProps;
  onOpenItem?: (id: string) => void;
  onViewWarranties?: () => void;
  /** The app navigates to `/inventory/reports/insurance`; the canvas renders inside an iframe, so this replaces it. */
  onOpenInsuranceReport?: () => void;
}

/**
 * `/inventory/reports`: the reporting hub, with the value-by-type and
 * value-by-location cards and a link into the insurance report below them.
 */
export function ReportDashboardPage({
  data,
  isLoading = false,
  valueByType,
  valueByLocation,
  onOpenItem = () => {},
  onViewWarranties = () => {},
  onOpenInsuranceReport = () => {},
}: ReportDashboardPageProps) {
  const { t } = useTranslation('inventory');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('reports')}
        icon={<BarChart3 className="h-6 w-6 text-muted-foreground" />}
      />

      <DashboardWidgets
        data={data}
        isLoading={isLoading}
        valueByType={valueByType}
        valueByLocation={valueByLocation}
        onOpenItem={onOpenItem}
        onViewWarranties={onViewWarranties}
      />

      <div className="pt-2">
        <Button
          variant="outline"
          prefix={<FileText className="h-4 w-4" />}
          onClick={onOpenInsuranceReport}
        >
          {t('report.insurance')}
        </Button>
      </div>
    </div>
  );
}

export const states: ScreenStates = {
  loading: () => (
    <ReportDashboardPage
      data={null}
      isLoading
      valueByType={{ data: [] }}
      valueByLocation={{ data: [] }}
    />
  ),
  empty: () => (
    <ReportDashboardPage
      data={dashboardSummaryEmpty}
      valueByType={{ data: valueByTypeBreakdownEmpty }}
      valueByLocation={{ data: valueByLocationBreakdownEmpty }}
    />
  ),
  'value-cards-loading': () => (
    <ReportDashboardPage
      data={dashboardSummary}
      valueByType={{ data: [], isLoading: true }}
      valueByLocation={{ data: [], isLoading: true }}
    />
  ),
  'value-cards-error': () => (
    <ReportDashboardPage
      data={dashboardSummary}
      valueByType={{ data: [], isError: true }}
      valueByLocation={{ data: [], isError: true }}
    />
  ),
  'value-cards-unavailable': () => (
    <ReportDashboardPage
      data={dashboardSummary}
      valueByType={{ data: [], isUnavailable: true }}
      valueByLocation={{ data: [], isUnavailable: true }}
    />
  ),
};

export default function ReportDashboardScreen() {
  return (
    <ReportDashboardPage
      data={dashboardSummary}
      valueByType={{ data: valueByTypeBreakdown }}
      valueByLocation={{ data: valueByLocationBreakdown }}
    />
  );
}
