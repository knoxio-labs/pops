import { useTranslation } from 'react-i18next';

import { Badge, Card, CardContent } from '@pops/ui';

import { CandidateCard } from './CandidateCard';
import { CandidatePagination } from './CandidatePagination';
import { PreferredFields } from './PreferredFields';

import type { ReviewChoices, ReviewItem } from './model';

interface ComparisonProps {
  item: ReviewItem;
  choices: ReviewChoices;
  onChange: (choices: ReviewChoices) => void;
  disabled: boolean;
  onCandidatesPage?: (offset: number) => void;
}

/** Focused comparison keeps incoming evidence and independent candidate decisions together. */
export function Comparison({
  item,
  choices,
  onChange,
  disabled,
  onCandidatesPage,
}: ComparisonProps) {
  const { t } = useTranslation('contacts');
  const selected = item.candidates.filter(
    (candidate) => choices.candidates[candidate.id] === 'merge'
  );
  return (
    <Card className="min-w-0">
      <CardContent className="min-w-0 space-y-6 pt-6">
        <Incoming item={item} />
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">{t('review.choose')}</h3>
          <p className="text-base leading-7 text-foreground/90">{t('review.chooseHint')}</p>
          {item.candidates.length === 0 && (
            <p className="text-base leading-7">{t('review.noCandidate')}</p>
          )}
          {item.candidates
            .filter(
              (candidate) =>
                !item.visibleCandidateIds || item.visibleCandidateIds.includes(candidate.id)
            )
            .map((candidate) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                choices={choices}
                onChange={onChange}
                disabled={disabled}
              />
            ))}
        </div>
        {onCandidatesPage && (
          <CandidatePagination item={item} disabled={disabled} onPage={onCandidatesPage} />
        )}
        {selected.length > 0 && (
          <PreferredFields
            defaultLabel={t(item.recognized ? 'review.currentValue' : 'review.incomingValue')}
            selected={selected}
            choices={choices}
            onChange={onChange}
            disabled={disabled}
          />
        )}
        <p className="text-sm leading-6 text-foreground/85">{t('review.retained')}</p>
      </CardContent>
    </Card>
  );
}

function Incoming({ item }: { item: ReviewItem }) {
  const { t } = useTranslation('contacts');
  return (
    <>
      <div>
        <p className="break-words text-sm text-foreground/85">
          {t('review.incoming', { source: item.source })}
        </p>
        <h2 className="break-words text-2xl font-semibold">{item.name || t('unnamedContact')}</h2>
        <Badge variant="outline">{t(item.status, { defaultValue: item.status })}</Badge>
      </div>
      <div className="space-y-2">
        {item.points.map((point) => (
          <p key={`${point.kind}-${point.value}`} className="break-words text-base text-foreground">
            <span className="font-semibold">
              {t(`pointKinds.${point.kind}`, { defaultValue: point.kind })}:{' '}
            </span>
            {point.value}
          </p>
        ))}
      </div>
      {item.errors.length > 0 && (
        <div role="alert" className="text-destructive">
          {item.errors.map((issue) => t(`rowIssues.${issue}`, { defaultValue: issue })).join(', ')}
        </div>
      )}
    </>
  );
}
