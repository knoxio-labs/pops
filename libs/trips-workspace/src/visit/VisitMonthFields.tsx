import { useTranslation } from 'react-i18next';

import { Select, TextInput } from '@pops/ui';

import { useSemanticDraft } from '../shared/semantic-draft';
import { monthValue } from './approximate';
import { monthDraft } from './timing-drafts';

import type { JSX } from 'react';

import type { VisitFieldProps } from './types';

/** Approximate source month capture with no implicit year, month or precision. */
export function VisitMonthFields({ visit, commit, timingDrafts }: VisitFieldProps): JSX.Element {
  const { t } = useTranslation('trips');
  const [draft, setDraft] = useSemanticDraft(
    monthDraft(visit.timing.month),
    timingDrafts?.month,
    timingDrafts?.isCurrent
  );
  const error = monthValue(draft).error;
  const save = (next: typeof draft): void => {
    const parsed = monthValue(next);
    if (parsed.error) return;
    const timing = { ...visit.timing };
    if (parsed.value) timing.month = parsed.value;
    else delete timing.month;
    void commit({ timing });
  };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {(['year', 'month'] as const).map((field) => (
          <TextInput
            key={field}
            label={t(`visitWorkspace.${field}`)}
            type="number"
            step="1"
            min={field === 'month' ? '1' : undefined}
            max={field === 'month' ? '12' : undefined}
            value={draft[field]}
            className="min-h-11"
            onChange={(event) => setDraft({ ...draft, [field]: event.currentTarget.value })}
            onBlur={() => save(draft)}
          />
        ))}
        <div className="col-span-2 sm:col-span-1">
          <Select
            label={t('visitWorkspace.part')}
            value={draft.part}
            className="min-h-11"
            options={[
              { value: '', label: t('visitWorkspace.anyPart') },
              { value: 'early', label: t('visitWorkspace.early') },
              { value: 'middle', label: t('visitWorkspace.middle') },
              { value: 'late', label: t('visitWorkspace.late') },
            ]}
            onChange={(event) => {
              const next = { ...draft, part: event.currentTarget.value };
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
