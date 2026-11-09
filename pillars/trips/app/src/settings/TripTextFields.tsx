import { MapPin, Type } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { TextInput } from '@pops/ui';

import { tripTitle } from '../home/model';

import type { TripDraft } from './model';

/** Source text stays independent of route timing and selection-derived titles. */
export function TripTextFields({
  draft,
  change,
}: {
  draft: TripDraft;
  change: (draft: TripDraft) => void;
}) {
  const { t } = useTranslation('trips');
  return (
    <>
      <TextInput
        label={t('destination')}
        prefix={<MapPin className="size-4" aria-hidden />}
        value={draft.destination}
        onChange={(event) => change({ ...draft, destination: event.currentTarget.value })}
      />
      <TextInput
        label={t('name')}
        prefix={<Type className="size-4" aria-hidden />}
        placeholder={tripTitle({ name: null, destination: draft.destination }, t('trip'))}
        value={draft.name}
        onChange={(event) => change({ ...draft, name: event.currentTarget.value })}
      />
      <TextInput
        label={t('when')}
        placeholder={t('whenPlaceholder')}
        value={draft.when}
        onChange={(event) => change({ ...draft, when: event.currentTarget.value })}
      />
    </>
  );
}
