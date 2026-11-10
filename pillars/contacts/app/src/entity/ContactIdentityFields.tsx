import { useTranslation } from 'react-i18next';

import { Select, TextInput } from '@pops/ui';

/** The approved progressive identity fields, shared by route and embedded creation. */
export function ContactIdentityFields({
  name,
  type,
  disabled,
  types,
  changeName,
  changeType,
}: {
  name: string;
  type: string;
  disabled: boolean;
  types: string[];
  changeName: (name: string) => void;
  changeType: (type: string) => void;
}) {
  const { t } = useTranslation('contacts');
  const options = type && !types.includes(type) ? [...types, type] : types;
  return (
    <>
      <TextInput
        label={t('entity.name')}
        className="text-sm"
        containerClassName="min-h-11"
        value={name}
        disabled={disabled}
        onChange={(event) => changeName(event.target.value)}
      />
      <Select
        aria-label={t('create.type')}
        className="min-h-11 text-sm"
        value={type}
        disabled={disabled}
        options={options.map((value) => ({
          value,
          label: t(`entityTypes.${value}`, { defaultValue: value }),
        }))}
        onChange={(event) => {
          if (options.includes(event.target.value)) changeType(event.target.value);
        }}
      />
    </>
  );
}
