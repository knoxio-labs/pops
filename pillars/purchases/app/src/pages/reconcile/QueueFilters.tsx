import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import type { ChangeEvent, ReactElement } from 'react';

import type { QueueFilterState, QueueKind } from './types.js';

const KINDS: readonly (QueueKind | 'all')[] = ['all', 'proposed', 'unexplained'];

interface QueueFiltersProps {
  value: QueueFilterState;
  onChange: (next: QueueFilterState) => void;
}

/**
 * The two filters the queue endpoint actually distinguishes.
 *
 * `kind` separates contested charges from unexplained ones — the contract
 * treats an empty proposal set as a different state, not a weaker match.
 * `includeAuto` is off by default because a grocery source is thousands of
 * line items a year, and a queue that asks about each one gets abandoned along
 * with the orders that do need a decision (ADR-042).
 */
export function QueueFilters({ value, onChange }: QueueFiltersProps): ReactElement {
  const { t } = useTranslation('purchases');

  function handleAutoChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange({ ...value, includeAuto: event.target.checked });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="group" aria-label={t('reconcile.filter.kindLabel')} className="flex gap-2">
        {KINDS.map((kind) => (
          <Button
            key={kind}
            size="sm"
            variant={value.kind === kind ? 'default' : 'outline'}
            aria-pressed={value.kind === kind}
            onClick={() => onChange({ ...value, kind })}
          >
            {t(`reconcile.filter.kind.${kind}`)}
          </Button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value.includeAuto} onChange={handleAutoChange} />
        {t('reconcile.filter.includeAuto')}
      </label>
    </div>
  );
}
