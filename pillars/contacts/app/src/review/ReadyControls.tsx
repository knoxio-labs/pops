import { useTranslation } from 'react-i18next';

import { Badge, Button } from '@pops/ui';

import type { ReadySummary } from './contracts';

/** One user action applies only the server's resolved whole-batch plan. */
export function ReadyAction({
  ready,
  disabled,
  applying,
  dirty,
  onApply,
  onReload,
}: {
  ready?: ReadySummary;
  disabled: boolean;
  applying: boolean;
  dirty: boolean;
  onApply: () => void;
  onReload: () => void;
}) {
  const { t } = useTranslation('contacts');
  return (
    <div className="space-y-2">
      <Button disabled={disabled || dirty || !ready || ready.eligibleRows === 0} onClick={onApply}>
        {t(applying ? 'ready.applying' : 'ready.apply')}
      </Button>
      {dirty && (
        <div className="space-y-2">
          <p role="status" className="max-w-sm text-sm leading-6 text-foreground/85">
            {t('ready.unsaved')}
          </p>
          <Button variant="outline" disabled={disabled} onClick={onReload}>
            {t('review.reload')}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Counts are copied from server eligibility metadata and never inferred from a displayed page. */
export function ReadyCounts({ ready }: { ready: ReadySummary }) {
  const { t } = useTranslation('contacts');
  return (
    <div className="flex flex-wrap gap-2" aria-label={t('ready.summary')}>
      <Badge variant="secondary">{t('ready.eligible', { count: ready.eligibleRows })}</Badge>
      <Badge variant="outline">{t('ready.merges', { count: ready.automaticMerges })}</Badge>
      <Badge variant="outline">{t('ready.newPeople', { count: ready.newPeople })}</Badge>
      <Badge variant="outline">{t('ready.updates', { count: ready.sourceUpdates })}</Badge>
      <Badge variant="outline">{t('ready.removals', { count: ready.sourceRemovals })}</Badge>
      <Badge variant="outline">{t('ready.reviewRequired', { count: ready.reviewRequired })}</Badge>
      <Badge variant="outline">{t('ready.deferred', { count: ready.deferred })}</Badge>
      <Badge variant="outline">{t('ready.processed', { count: ready.alreadyProcessed })}</Badge>
    </div>
  );
}
