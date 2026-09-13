import { useTranslation } from 'react-i18next';

import { CollapsibleSection, ExpiringSection } from './sections';
import { WarrantyRow } from './warranty-row';

import type { WarrantyTiers } from './categorize';
import type { WarrantyEntry } from './types';

function TierRows({
  items,
  paperlessBaseUrl,
  onItemClick,
}: {
  items: WarrantyEntry[];
  paperlessBaseUrl: string | null;
  onItemClick: (id: string) => void;
}) {
  return (
    <>
      {items.map((item) => (
        <WarrantyRow
          key={item.id}
          item={item}
          daysRemaining={item.daysRemaining}
          paperlessBaseUrl={paperlessBaseUrl}
          onClick={() => onItemClick(item.id)}
        />
      ))}
    </>
  );
}

/**
 * The three always-visible expiring tiers plus the collapsible Active and
 * Expired sections, exactly as `WarrantyContent` in the source composes them.
 * Active opens by default; Expired opens only when nothing else is expiring
 * and Active is empty too.
 */
export function WarrantyContent({
  tiers,
  paperlessBaseUrl,
  onItemClick,
}: {
  tiers: WarrantyTiers;
  paperlessBaseUrl: string | null;
  onItemClick: (id: string) => void;
}) {
  const { t } = useTranslation('inventory');
  const { critical, warning, caution, active, expired } = tiers;
  const hasExpiringItems = critical.length + warning.length + caution.length > 0;

  return (
    <div className="space-y-4">
      <ExpiringSection
        tier="critical"
        items={critical}
        paperlessBaseUrl={paperlessBaseUrl}
        onItemClick={onItemClick}
      />
      <ExpiringSection
        tier="warning"
        items={warning}
        paperlessBaseUrl={paperlessBaseUrl}
        onItemClick={onItemClick}
      />
      <ExpiringSection
        tier="caution"
        items={caution}
        paperlessBaseUrl={paperlessBaseUrl}
        onItemClick={onItemClick}
      />
      {active.length > 0 && (
        <CollapsibleSection title={t('section.active')} count={active.length} defaultOpen>
          <TierRows items={active} paperlessBaseUrl={paperlessBaseUrl} onItemClick={onItemClick} />
        </CollapsibleSection>
      )}
      {expired.length > 0 && (
        <CollapsibleSection
          title={t('section.expired')}
          count={expired.length}
          defaultOpen={!hasExpiringItems && active.length === 0}
        >
          <TierRows items={expired} paperlessBaseUrl={paperlessBaseUrl} onItemClick={onItemClick} />
        </CollapsibleSection>
      )}
    </div>
  );
}
