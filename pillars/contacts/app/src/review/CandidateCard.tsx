import { useTranslation } from 'react-i18next';

import { Button, CheckboxInput } from '@pops/ui';

import { chooseCandidate, type ReviewCandidate, type ReviewChoices } from './model';

interface CandidateProps {
  candidate: ReviewCandidate;
  choices: ReviewChoices;
  disabled: boolean;
  onChange: (choices: ReviewChoices) => void;
}

/** One real candidate's evidence and independent identity disposition. */
export function CandidateCard({ candidate, choices, disabled, onChange }: CandidateProps) {
  const { t } = useTranslation('contacts');
  const choice = choices.candidates[candidate.id];
  return (
    <section
      aria-label={t('review.existing', { name: candidate.name })}
      className={`space-y-3 rounded-lg border p-4 ${choice === 'merge' ? 'border-app-accent bg-accent' : 'border-border bg-background'}`}
    >
      <CheckboxInput
        disabled={disabled || candidate.keepSeparate || candidate.entityId === null}
        checked={choice === 'merge'}
        label={<span className="text-base font-semibold leading-6">{candidate.name}</span>}
        onCheckedChange={(checked) =>
          onChange(chooseCandidate(choices, candidate, checked ? 'merge' : 'later'))
        }
      />
      {candidate.points.map((point) => (
        <p key={point.id} className="break-words text-base text-foreground/90">
          {t(`pointKinds.${point.kind}`, { defaultValue: point.kind })}: {point.value}
        </p>
      ))}
      <p className="text-sm text-foreground/85">{candidate.sources.join(' · ')}</p>
      <p className="text-sm text-foreground/85">
        {candidate.reasons
          .map((reason) => t(`reasons.${reason}`, { defaultValue: reason }))
          .join(' · ')}
      </p>
      {candidate.hasInactiveSource && <p className="text-sm">{t('review.inactive')}</p>}
      {candidate.entityId === null && (
        <p className="text-sm font-semibold">{t('review.unmaterialized')}</p>
      )}
      {candidate.keepSeparate && <p className="text-sm font-semibold">{t('review.remembered')}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={disabled || candidate.entityId === null}
          variant={choice === 'different' ? 'secondary' : 'outline'}
          aria-pressed={choice === 'different'}
          onClick={() => onChange(chooseCandidate(choices, candidate, 'different'))}
        >
          {t('review.different')}
        </Button>
        <Button
          disabled={disabled}
          variant={choice === 'later' ? 'secondary' : 'ghost'}
          aria-pressed={choice === 'later'}
          onClick={() => onChange(chooseCandidate(choices, candidate, 'later'))}
        >
          {t('review.later')}
        </Button>
      </div>
    </section>
  );
}
