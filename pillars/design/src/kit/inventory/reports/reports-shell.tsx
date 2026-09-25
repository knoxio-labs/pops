import { HintTooltip } from '@/kit/inventory/foundation';
import { InventoryPage, PageStateBanner, PageTabs } from '@/kit/inventory/secondary-page';
/**
 * `/inventory/reports`: one page, four tabs (Overview, Values, Warranties,
 * Insurance), the tab in the URL. Export CSV and Print act on the tab shown.
 * Every figure counts active items only; the page says so once, here.
 */
import { BarChart3, Download, Printer } from 'lucide-react';

import { Button } from '@pops/ui';

import type { PageBanner } from '@/kit/inventory/secondary-page';
import type { ReactNode } from 'react';

/** The report tabs. */
export type ReportTab = 'overview' | 'values' | 'warranties' | 'insurance';

const TABS: readonly { value: ReportTab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'values', label: 'Values' },
  { value: 'warranties', label: 'Warranties' },
  { value: 'insurance', label: 'Insurance' },
];

/** Props for {@link ReportsPage}. */
export interface ReportsPageProps {
  tab: ReportTab;
  banner?: PageBanner;
  /** Why export is off (nothing to export, still loading). */
  exportBlocked?: string;
  onTabChange?: (tab: ReportTab) => void;
  onExport?: () => void;
  onPrint?: () => void;
  children: ReactNode;
}

/** The reports page frame. */
export function ReportsPage(props: ReportsPageProps) {
  const blocked = props.exportBlocked;
  return (
    <InventoryPage
      icon={BarChart3}
      title="Reports"
      description="What the active items are worth, what is covered, and what an insurer needs."
      actions={
        <div className="flex gap-2">
          <HintTooltip label="Print this report" disabledReason={blocked}>
            <Button
              variant="outline"
              aria-disabled={blocked !== undefined || undefined}
              className={blocked ? 'opacity-50' : undefined}
              prefix={<Printer className="size-4" aria-hidden />}
              onClick={blocked ? undefined : props.onPrint}
            >
              Print
            </Button>
          </HintTooltip>
          <HintTooltip label="Download this report as CSV" disabledReason={blocked}>
            <Button
              aria-disabled={blocked !== undefined || undefined}
              className={blocked ? 'opacity-50' : undefined}
              prefix={<Download className="size-4" aria-hidden />}
              onClick={blocked ? undefined : props.onExport}
            >
              Export CSV
            </Button>
          </HintTooltip>
        </div>
      }
      tabs={<PageTabs label="Reports" tabs={TABS} value={props.tab} onChange={props.onTabChange} />}
      banner={<PageStateBanner banner={props.banner} what="Inventory" />}
    >
      {props.children}
    </InventoryPage>
  );
}
