import { useTranslation } from 'react-i18next';
import { Button } from '@pops/ui';

import { FILTER_OPTIONS } from './types';

import type { WatchlistFilter } from './types';

type WatchlistFilterTabsProps = {
  filter: WatchlistFilter;
  onFilterChange: (value: WatchlistFilter) => void;
};

export function WatchlistFilterTabs({ filter, onFilterChange }: WatchlistFilterTabsProps) {
  const { t } = useTranslation('media');
  return (
    <div className="flex gap-2" role="tablist" aria-label={t('watchlist.filterWatchlist')}>
      {FILTER_OPTIONS.map((opt) => (
        <Button
          key={opt.value}
          variant={filter === opt.value ? 'default' : 'secondary'}
          size="sm"
          role="tab"
          aria-selected={filter === opt.value}
          onClick={() => onFilterChange(opt.value)}
          shape="pill"
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
