import { useTranslation } from 'react-i18next';

import { Button, Skeleton } from '@pops/ui';

import { describeContactError } from '../errors';

import type { useReview } from './useReview';

/** Show acknowledged results and explicit recovery for failed or stale writes. */
export function ReviewFeedback({
  model,
  onReload,
}: {
  model: ReturnType<typeof useReview>;
  onReload: () => void;
}) {
  const { t } = useTranslation('contacts');
  return (
    <>
      {model.error && (
        <div role="alert" className="space-y-3 rounded-lg border border-destructive p-4">
          <p>{describeContactError(model.error, t)}</p>
          <div className="flex flex-wrap gap-2">
            {model.uncertain && (
              <Button disabled={model.saving} onClick={() => void model.retry()}>
                {t('review.retry')}
              </Button>
            )}
            <Button variant="outline" disabled={model.saving} onClick={onReload}>
              {t('review.reload')}
            </Button>
          </div>
          <p className="text-sm">{t('review.reloadHint')}</p>
        </div>
      )}
      {model.success && (
        <p role="status" className="text-base font-semibold">
          {model.readyApplied === null
            ? t('review.saved')
            : t('ready.saved', { count: model.readyApplied })}
        </p>
      )}
      {model.isPending && (
        <div aria-label={t('review.loading')} className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}
    </>
  );
}
