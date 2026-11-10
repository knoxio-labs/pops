import { useTranslation } from 'react-i18next';

import { Select, TextInput } from '@pops/ui';

import { useSemanticDraft } from '../shared/semantic-draft';
import { durationValue } from './approximate';
import { durationDraft } from './timing-drafts';
import { VisitMonthFields } from './VisitMonthFields';

import type { JSX } from 'react';

import type { VisitFieldProps } from './types';

/** Approximate source facts have no implicit month, unit or duration bounds. */
export function VisitApproximateTiming(props: VisitFieldProps): JSX.Element {
  const { t } = useTranslation('trips');
  return (
    <details open={Boolean(props.visit.timing.month ?? props.visit.timing.duration)}>
      <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
        {t('visitWorkspace.approximate')}
      </summary>
      <div className="space-y-3">
        <VisitMonthFields key={JSON.stringify(props.visit.timing.month)} {...props} />
        <DurationFields key={JSON.stringify(props.visit.timing.duration)} {...props} />
      </div>
    </details>
  );
}
function DurationFields({ visit, commit, timingDrafts }: VisitFieldProps): JSX.Element {
  const { t } = useTranslation('trips');
  const [draft, setDraft] = useSemanticDraft(
    durationDraft(visit.timing.duration),
    timingDrafts?.duration,
    timingDrafts?.isCurrent
  );
  const error = durationValue(draft).error;
  const save = (next: typeof draft): void => {
    const parsed = durationValue(next);
    if (parsed.error) return;
    const timing = { ...visit.timing };
    if (parsed.value) timing.duration = parsed.value;
    else delete timing.duration;
    void commit({ timing });
  };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {(['min', 'max'] as const).map((field) => (
          <TextInput
            key={field}
            label={t(field === 'min' ? 'visitWorkspace.minimum' : 'visitWorkspace.maximum')}
            type="number"
            min="0"
            step="any"
            value={draft[field]}
            className="min-h-11"
            onChange={(event) => setDraft({ ...draft, [field]: event.currentTarget.value })}
            onBlur={() => save(draft)}
          />
        ))}
        <div className="col-span-2 sm:col-span-1">
          <Select
            label={t('visitWorkspace.unit')}
            value={draft.unit}
            className="min-h-11"
            options={[
              { value: '', label: t('visitWorkspace.chooseUnit') },
              { value: 'days', label: t('visitWorkspace.days') },
              { value: 'weeks', label: t('visitWorkspace.weeks') },
            ]}
            onChange={(event) => {
              const next = { ...draft, unit: event.currentTarget.value };
              setDraft(next);
              save(next);
            }}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(`visitWorkspace.${error}`)}
        </p>
      )}
    </div>
  );
}
