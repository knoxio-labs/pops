import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import { CopyValue } from './CopyValue';
import { PersonFactField } from './PersonFactField';

import type { AddressDraft } from './draft';

/** Keep the address, label and city independently editable without deriving any location association. */
export function AddressEditor({
  address,
  index,
  disabled,
  change,
  remove,
}: {
  address: AddressDraft;
  index: number;
  disabled: boolean;
  change: (address: AddressDraft) => void;
  remove: () => void;
}) {
  const { t } = useTranslation('contacts');
  return (
    <li
      aria-label={t('person.addressRow', { number: index + 1 })}
      className="flex items-start gap-1 border-b border-border py-2 last:border-b-0"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="grid gap-1 sm:grid-cols-2">
          <PersonFactField
            label={t('person.addressLabel')}
            value={address.label}
            disabled={disabled}
            change={(label) => change({ ...address, label })}
          />
          <PersonFactField
            label={t('person.city')}
            value={address.city}
            disabled={disabled}
            change={(city) => change({ ...address, city })}
          />
        </div>
        <PersonFactField
          label={t('person.address')}
          multiline
          value={address.value}
          disabled={disabled}
          change={(value) => change({ ...address, value })}
        />
      </div>
      <CopyValue key={address.value} value={address.value} />
      <Button
        variant="ghost"
        className="min-h-11 min-w-11"
        disabled={disabled}
        aria-label={t('person.removeAddress', { number: index + 1 })}
        onClick={remove}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </li>
  );
}
