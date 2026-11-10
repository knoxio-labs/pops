import { useTranslation } from 'react-i18next';

import { Select, Textarea, TextInput } from '@pops/ui';

import { VisitApproximateTiming } from './VisitApproximateTiming';

import type { JSX } from 'react';

import type { Place, Visit, VisitFieldProps } from './types';

/** Source-owned visit fields preserve independent exact and approximate timing. */
export function VisitFields({
  places,
  ...props
}: VisitFieldProps & { places: Place[] }): JSX.Element {
  const { t } = useTranslation('trips');
  const { visit, edit, commit } = props;
  const hasPlace = places.some((place) => place.id === visit.placeId);
  return (
    <div className="space-y-3">
      <Select
        label={t('visitWorkspace.city')}
        value={String(visit.placeId)}
        className="min-h-11"
        options={[
          ...(!hasPlace
            ? [{ value: String(visit.placeId), label: t('visitWorkspace.cityUnavailable') }]
            : []),
          ...places.map((place) => ({ value: String(place.id), label: place.name })),
        ]}
        onChange={(event) => {
          const place = places.find((item) => String(item.id) === event.currentTarget.value);
          if (place) void commit({ placeId: place.id });
        }}
      />
      <div className="grid grid-cols-2 gap-3">
        {(['arrival', 'departure'] as const).map((field) => (
          <TextInput
            key={field}
            label={t(`visitWorkspace.${field}`)}
            type="date"
            className="min-h-11"
            value={visit.timing[field] ?? ''}
            onChange={(event) =>
              edit({ timing: changeDate(visit.timing, field, event.currentTarget.value) })
            }
            onBlur={(event) =>
              commit({ timing: changeDate(visit.timing, field, event.currentTarget.value) })
            }
          />
        ))}
      </div>
      <VisitApproximateTiming {...props} />
      <details>
        <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
          {t('visitWorkspace.notes')}
        </summary>
        <Textarea
          aria-label={t('visitWorkspace.visitNotes')}
          value={visit.notes}
          onChange={(event) => edit({ notes: event.currentTarget.value })}
          onBlur={(event) => commit({ notes: event.currentTarget.value })}
        />
      </details>
    </div>
  );
}
function changeDate(
  timing: Visit['timing'],
  field: 'arrival' | 'departure',
  value: string
): Visit['timing'] {
  const next = { ...timing };
  if (value) next[field] = value;
  else delete next[field];
  return next;
}
