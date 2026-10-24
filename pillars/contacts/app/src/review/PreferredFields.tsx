import { useTranslation } from 'react-i18next';

import { CheckboxInput, Select } from '@pops/ui';

import type { TFunction } from 'i18next';

import type { ReviewCandidate, ReviewChoices } from './model';

function preferPoint(
  choices: ReviewChoices,
  points: ReviewCandidate['points'],
  point: ReviewCandidate['points'][number],
  checked: boolean
): ReviewChoices {
  const sameKind = new Set(
    points.filter((entry) => entry.kind === point.kind).map((entry) => entry.id)
  );
  const others = choices.preferredPointIds.filter((id) => !sameKind.has(id));
  return { ...choices, preferredPointIds: checked ? [...others, point.id] : others };
}

function fieldOptions(
  selected: ReviewCandidate[],
  field: 'name' | 'profile',
  incomingValue: string | undefined,
  t: TFunction<'contacts'>
) {
  return [
    { value: '', label: t('review.currentValue') },
    ...(incomingValue
      ? [{ value: 'incoming', label: t('review.incomingValue', { value: incomingValue }) }]
      : []),
    ...selected.flatMap((candidate) => {
      const local =
        field === 'name' || candidate.profileAvailable !== false
          ? [
              {
                value: `entity:${candidate.id}`,
                label: t('review.localValue', {
                  value:
                    field === 'name'
                      ? candidate.localName
                      : (candidate.localProfileLabel ?? candidate.localName),
                }),
              },
            ]
          : [];
      const sources = candidate.sourceOptions
        .filter((source) =>
          field === 'name' ? source.name.length > 0 : source.profileLabel !== undefined
        )
        .map((source) => ({
          value: `source:${source.id}`,
          label: t(source.label ? 'review.namedSourceValue' : 'review.sourceValue', {
            source:
              source.active === false
                ? t('review.inactiveSource', { source: source.label })
                : source.label,
            value: field === 'name' ? source.name : source.profileLabel,
          }),
        }));
      return [...local, ...sources];
    }),
  ];
}

function selectField(
  choices: ReviewChoices,
  field: 'name' | 'profile',
  value: string
): ReviewChoices {
  const incomingField: 'name' | 'personProfile' = field === 'name' ? 'name' : 'personProfile';
  const remaining = choices.incomingFields?.filter((entry) => entry !== incomingField) ?? [];
  const incomingFields = value === 'incoming' ? [...remaining, incomingField] : remaining;
  const entityId = value.startsWith('entity:') ? value.slice(7) : undefined;
  const sourceRecordId = value.startsWith('source:') ? value.slice(7) : undefined;
  return field === 'name'
    ? { ...choices, incomingFields, nameEntityId: entityId, nameSourceRecordId: sourceRecordId }
    : {
        ...choices,
        incomingFields,
        profileEntityId: entityId,
        profileSourceRecordId: sourceRecordId,
      };
}

/** Preferred fields may come only from explicitly selected identities and their retained sources. */
export function PreferredFields({
  selected,
  choices,
  onChange,
  disabled,
  incomingName,
  incomingProfile,
}: {
  selected: ReviewCandidate[];
  choices: ReviewChoices;
  onChange: (choices: ReviewChoices) => void;
  disabled: boolean;
  incomingName: string;
  incomingProfile?: string;
}) {
  const { t } = useTranslation('contacts');
  const points = selected
    .flatMap((candidate) => candidate.points)
    .filter((point) => point.persisted !== false);
  const nameValue = choices.nameSourceRecordId
    ? `source:${choices.nameSourceRecordId}`
    : choices.nameEntityId && `entity:${choices.nameEntityId}`;
  const profileValue = choices.profileSourceRecordId
    ? `source:${choices.profileSourceRecordId}`
    : choices.profileEntityId && `entity:${choices.profileEntityId}`;
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">{t('review.preferred')}</h3>
      <Select
        className="min-w-0"
        label={t('review.name')}
        options={fieldOptions(selected, 'name', incomingName, t)}
        value={choices.incomingFields?.includes('name') ? 'incoming' : (nameValue ?? '')}
        disabled={disabled}
        onChange={(event) => onChange(selectField(choices, 'name', event.target.value))}
      />
      <Select
        className="min-w-0"
        label={t('review.profile')}
        options={fieldOptions(selected, 'profile', incomingProfile, t)}
        value={
          choices.incomingFields?.includes('personProfile') ? 'incoming' : (profileValue ?? '')
        }
        disabled={disabled}
        onChange={(event) => onChange(selectField(choices, 'profile', event.target.value))}
      />
      <PointChoices points={points} choices={choices} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function PointChoices({
  points,
  choices,
  onChange,
  disabled,
}: {
  points: ReviewCandidate['points'];
  choices: ReviewChoices;
  onChange: (choices: ReviewChoices) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation('contacts');
  return (
    <>
      {points.map((point) => (
        <CheckboxInput
          key={point.id}
          label={
            <span className="break-all">
              {t('review.preferPoint', {
                kind: t(`pointKinds.${point.kind}`, { defaultValue: point.kind }),
                value: point.value,
              })}
            </span>
          }
          checked={choices.preferredPointIds.includes(point.id)}
          disabled={disabled}
          onCheckedChange={(checked) => onChange(preferPoint(choices, points, point, checked))}
        />
      ))}
    </>
  );
}
