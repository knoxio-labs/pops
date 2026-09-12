import {
  scrollableTierWarrantiesAt,
  singleTierWarrantyAt,
  warrantyItemsAt,
} from '@/fixtures/inventory-warranties';
import { categorizeWarranties } from '@/kit/inventory/warranties/categorize';
import { EmptyState, ErrorState, WarrantySkeleton } from '@/kit/inventory/warranties/states';
import { WarrantyContent } from '@/kit/inventory/warranties/warranty-content';
import { ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { WarrantyItem } from '@/kit/inventory/warranties/types';
import type { ReactNode } from 'react';

export const meta: ScreenMeta = { title: 'Warranties', order: 4, frame: 'web' };

/** The header every render of this screen shares, loading and error states included. */
function Shell({ children }: { children: ReactNode }) {
  const { t } = useTranslation('inventory');
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('section.warrantyTracking')}
        icon={
          <div className="p-2 rounded-xl bg-app-accent/10">
            <ShieldCheck className="h-6 w-6 text-app-accent" />
          </div>
        }
      />
      {children}
    </div>
  );
}

export interface WarrantiesPageProps {
  items: WarrantyItem[];
  /**
   * The instant tiers are computed relative to. Every fixture date is an
   * offset from this, not a calendar date, so a state's tier never drifts as
   * today's date moves past it.
   */
  now?: Date;
  paperlessBaseUrl?: string | null;
  /** Real navigation would leave the canvas iframe, so this replaces it. */
  onItemClick?: (id: string) => void;
  /** Replaces the source's `<Link to="/inventory/items">`, same reason. */
  onBrowseItems?: () => void;
}

/**
 * `/inventory/warranties`: every item with a warranty expiry date, sorted
 * into five tiers relative to `now` (critical under 30 days, warning 30 to
 * 60, caution 60 to 90, active beyond that, expired in the past). The three
 * expiring tiers are always visible; Active and Expired collapse, Active
 * open by default and Expired open only when nothing else needs attention.
 */
export function WarrantiesPage({
  items,
  now = new Date(),
  paperlessBaseUrl = null,
  onItemClick = () => {},
  onBrowseItems = () => {},
}: WarrantiesPageProps) {
  const tiers = useMemo(() => categorizeWarranties(items, now), [items, now]);
  const totalItems = Object.values(tiers).reduce((sum, tier) => sum + tier.length, 0);

  return (
    <Shell>
      {totalItems === 0 ? (
        <EmptyState onBrowseItems={onBrowseItems} />
      ) : (
        <WarrantyContent
          tiers={tiers}
          paperlessBaseUrl={paperlessBaseUrl}
          onItemClick={onItemClick}
        />
      )}
    </Shell>
  );
}

function oneItemState(id: string, paperlessBaseUrl: string | null = null) {
  const now = new Date();
  const items = warrantyItemsAt(now).filter((item) => item.id === id);
  return <WarrantiesPage items={items} now={now} paperlessBaseUrl={paperlessBaseUrl} />;
}

export const states: ScreenStates = {
  loading: () => (
    <Shell>
      <WarrantySkeleton />
    </Shell>
  ),
  error: () => (
    <Shell>
      <ErrorState onRetry={() => {}} />
    </Shell>
  ),
  empty: () => <WarrantiesPage items={[]} />,
  critical: () => oneItemState('itm-laptop'),
  warning: () => oneItemState('itm-camera'),
  caution: () => oneItemState('itm-vacuum'),
  active: () => oneItemState('itm-tv'),
  expired: () => oneItemState('itm-printer'),
  'null-provider-no-asset-id': () => oneItemState('itm-sofa'),
  'single-item-in-tier': () => {
    const now = new Date();
    return <WarrantiesPage items={singleTierWarrantyAt(now)} now={now} />;
  },
  'scrollable-tier': () => {
    const now = new Date();
    return <WarrantiesPage items={scrollableTierWarrantiesAt(now)} now={now} />;
  },
  'paperless-unavailable': () => oneItemState('itm-laptop', null),
  'paperless-linked': () => oneItemState('itm-laptop', 'https://paperless.example'),
  'all-tiers': () => {
    const now = new Date();
    return <WarrantiesPage items={warrantyItemsAt(now)} now={now} />;
  },
};

export default function WarrantiesScreen() {
  const [now] = useState(() => new Date());
  return <WarrantiesPage items={warrantyItemsAt(now)} now={now} />;
}
