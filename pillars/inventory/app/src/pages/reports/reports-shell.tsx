import { BarChart3, Download, Printer } from 'lucide-react';

import { Button } from '@pops/ui';

import { InventoryPage } from '../../foundation/frame/page-frame.js';
import { Segmented } from '../../foundation/frame/segmented.js';
import { REPORT_TABS, type ReportTab } from './reports-model.js';

import type { ReactElement, ReactNode } from 'react';

/** Props for the shared `/inventory/reports` frame. */
export interface ReportsShellProps {
  readonly tab: ReportTab;
  readonly exportBlocked?: string;
  readonly onTabChange?: (tab: ReportTab) => void;
  readonly onExport?: () => void;
  readonly onPrint?: () => void;
  readonly banner?: ReactNode;
  readonly children: ReactNode;
}

/** Renders the reports title, URL-backed tabs, state banner, and actions. */
export function ReportsShell({
  tab,
  exportBlocked,
  onTabChange,
  onExport,
  onPrint,
  banner,
  children,
}: ReportsShellProps): ReactElement {
  const exportDisabled = exportBlocked !== undefined || onExport === undefined;
  const printDisabled = exportBlocked !== undefined || onPrint === undefined;
  const disabledTitle = exportBlocked ?? 'This report is not ready to export.';
  return (
    <InventoryPage
      title="Reports"
      icon={BarChart3}
      description="What the active items are worth, what is covered, and what an insurer needs."
      actions={
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={printDisabled}
            title={printDisabled ? disabledTitle : 'Print this report'}
            prefix={<Printer className="size-4" aria-hidden />}
            onClick={onPrint}
          >
            Print
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={exportDisabled}
            title={exportDisabled ? disabledTitle : 'Download this report as CSV'}
            prefix={<Download className="size-4" aria-hidden />}
            onClick={onExport}
          >
            Export CSV
          </Button>
        </div>
      }
      tabs={<Segmented label="Reports" segments={REPORT_TABS} value={tab} onChange={onTabChange} />}
      banner={banner}
      bodyClassName="gap-3"
    >
      {children}
    </InventoryPage>
  );
}
