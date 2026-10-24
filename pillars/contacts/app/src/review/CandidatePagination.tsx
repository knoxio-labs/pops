import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import type { ReviewItem } from './model';

/** Request additional evidence pages while preserving decisions by real candidate identity. */
export function CandidatePagination({
  item,
  disabled,
  onPage,
}: {
  item: ReviewItem;
  disabled: boolean;
  onPage: (offset: number) => void;
}) {
  const { t } = useTranslation('contacts');
  if (item.candidateTotal <= item.candidateLimit) return null;
  return (
    <nav aria-label={t('queue.candidates')} className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        disabled={disabled || item.candidateOffset === 0}
        onClick={() => onPage(Math.max(0, item.candidateOffset - item.candidateLimit))}
      >
        {t('queue.previousCandidates')}
      </Button>
      <span className="text-sm">
        {t('queue.candidateRange', {
          start: item.candidateOffset + 1,
          end: Math.min(item.candidateOffset + item.candidateLimit, item.candidateTotal),
          total: item.candidateTotal,
        })}
      </span>
      <Button
        variant="outline"
        disabled={disabled || item.candidateOffset + item.candidateLimit >= item.candidateTotal}
        onClick={() => onPage(item.candidateOffset + item.candidateLimit)}
      >
        {t('queue.nextCandidates')}
      </Button>
    </nav>
  );
}
