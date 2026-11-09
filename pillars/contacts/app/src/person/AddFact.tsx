import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Select, TextInput } from '@pops/ui';

import type { ContactPointInput, ContactPointKind } from '../contacts-api/types.gen';

const kinds: ContactPointKind[] = ['email', 'phone', 'social', 'url'];
const emptyPoint: ContactPointInput = { kind: 'email', value: '', label: '', countryCode: '' };

/** Append one local observation without changing imported or preferred observations. */
export function AddContactPoint({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (point: ContactPointInput) => Promise<boolean>;
}) {
  const { t } = useTranslation('contacts');
  const [point, setPoint] = useState(emptyPoint);
  return (
    <form
      className="space-y-3 border-t border-border pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onAdd({
          ...point,
          label: point.label || null,
          countryCode: point.kind === 'phone' ? point.countryCode || null : null,
        }).then((saved) => {
          if (saved) setPoint({ ...emptyPoint, kind: point.kind });
        });
      }}
    >
      <fieldset disabled={disabled} className="space-y-3">
        <legend className="mb-3 text-sm font-medium">{t('person.addMethod')}</legend>
        <PointFields point={point} change={setPoint} />
        <Button
          type="submit"
          className="min-h-11 text-sm"
          variant="outline"
          disabled={disabled || !point.value.trim()}
        >
          {t('person.addMethod')}
        </Button>
      </fieldset>
    </form>
  );
}

function PointFields({
  point,
  change,
}: {
  point: ContactPointInput;
  change: (point: ContactPointInput) => void;
}) {
  const { t } = useTranslation('contacts');
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          aria-label={t('person.kind')}
          className="min-h-11 text-sm"
          value={point.kind}
          options={kinds.map((item) => ({ value: item, label: t(`pointKinds.${item}`) }))}
          onChange={(event) => {
            const selected = kinds.find((item) => item === event.target.value);
            if (selected) change({ ...point, kind: selected });
          }}
        />
        <TextInput
          label={t('person.label')}
          className="text-sm"
          containerClassName="min-h-11"
          value={point.label ?? ''}
          onChange={(event) => change({ ...point, label: event.target.value })}
        />
      </div>
      <TextInput
        label={t('person.value')}
        className="text-sm"
        containerClassName="min-h-11"
        required
        value={point.value}
        onChange={(event) => change({ ...point, value: event.target.value })}
      />
      {point.kind === 'phone' && (
        <TextInput
          label={t('upload.country')}
          className="text-sm"
          containerClassName="min-h-11"
          value={point.countryCode ?? ''}
          onChange={(event) => change({ ...point, countryCode: event.target.value })}
        />
      )}
    </>
  );
}

/** Add a raw address verbatim; the current contract has no city or label fields. */
export function AddAddress({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (value: string) => Promise<boolean>;
}) {
  const { t } = useTranslation('contacts');
  const [value, setValue] = useState('');
  return (
    <form
      className="space-y-3 border-t border-border pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onAdd(value).then((saved) => {
          if (saved) setValue('');
        });
      }}
    >
      <TextInput
        label={t('person.address')}
        className="text-sm"
        containerClassName="min-h-11"
        disabled={disabled}
        required
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button
        type="submit"
        className="min-h-11 text-sm"
        variant="outline"
        disabled={disabled || !value.trim()}
      >
        {t('person.addAddress')}
      </Button>
    </form>
  );
}
