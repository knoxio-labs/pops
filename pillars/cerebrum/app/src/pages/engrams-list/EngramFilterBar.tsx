/**
 * Filter bar for the Engrams list page — scope, source, status, and
 * a clear button. The search box itself lives on the page so it can
 * stay full-width.
 */
import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import { FilterSelect } from '../../components/FilterSelect';
import { ENGRAM_SOURCES, ENGRAM_STATUSES, type EngramStatus } from '../../engrams/types';
import { TOUCH_TARGET_MIN_HEIGHT } from '../../utils/touchTarget';

import type { useEngramListModel } from '../../engrams/useEngramListModel';

type Model = ReturnType<typeof useEngramListModel>;

export function EngramFilterBar({ model }: { model: Model }) {
  const { t } = useTranslation('cerebrum');
  return (
    <div className="flex flex-wrap items-end gap-3">
      <FilterSelect
        label={t('engrams.filters.scope')}
        value={model.filters.scope}
        options={model.scopeOptions}
        emptyLabel={t('engrams.filters.allScopes')}
        onChange={(scope) => model.setFilters({ ...model.filters, scope })}
      />
      <FilterSelect
        label={t('engrams.filters.source')}
        value={model.filters.source}
        options={ENGRAM_SOURCES}
        emptyLabel={t('engrams.filters.allSources')}
        onChange={(source) => model.setFilters({ ...model.filters, source })}
      />
      <FilterSelect
        label={t('engrams.filters.status')}
        value={model.filters.status}
        options={ENGRAM_STATUSES}
        emptyLabel={t('engrams.filters.allStatuses')}
        onChange={(status) =>
          model.setFilters({
            ...model.filters,
            status: (status as EngramStatus | null) ?? null,
          })
        }
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => model.resetFilters()}
        className={TOUCH_TARGET_MIN_HEIGHT}
      >
        {t('engrams.filters.clear')}
      </Button>
    </div>
  );
}
