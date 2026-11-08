import { useTranslation } from 'react-i18next';

import { Badge } from '@pops/ui';

import { AddAddress, AddContactPoint } from './AddFact';
import { CopyValue } from './CopyValue';

import type { ContactPoint, ContactPointInput } from '../contacts-api/types.gen';
import type { PersonSnapshot } from './contracts';

/** Repeatable contact methods and addresses precede notes, preserving inactive and preferred provenance. */
export function PersonFacts({
  data,
  disabled,
  addPoint,
  addAddress,
}: {
  data: PersonSnapshot;
  disabled: boolean;
  addPoint: (point: ContactPointInput) => Promise<boolean>;
  addAddress: (value: string) => Promise<boolean>;
}) {
  const { t } = useTranslation('contacts');
  return (
    <>
      <section aria-label={t('person.methods')} className="space-y-4 rounded-xl border p-4">
        <h2 className="text-lg font-semibold">{t('person.methods')}</h2>
        {data.points.length === 0 && <p>{t('person.noMethods')}</p>}
        <ul className="divide-y">
          {data.points.map((point) => (
            <PointObservation key={point.id} point={point} data={data} />
          ))}
        </ul>
        <AddContactPoint disabled={disabled} onAdd={addPoint} />
      </section>
      <section aria-label={t('person.addresses')} className="space-y-4 rounded-xl border p-4">
        <h2 className="text-lg font-semibold">{t('person.addresses')}</h2>
        {data.addresses.length === 0 && <p>{t('person.noAddresses')}</p>}
        <ul className="divide-y">
          {data.addresses.map((address) => (
            <li key={address.id} className="flex items-start gap-3 py-3">
              <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">{address.value}</p>
              <CopyValue key={address.value} value={address.value} />
            </li>
          ))}
        </ul>
        <AddAddress disabled={disabled} onAdd={addAddress} />
      </section>
    </>
  );
}

function PointObservation({ point, data }: { point: ContactPoint; data: PersonSnapshot }) {
  const { t } = useTranslation('contacts');
  const source = data.sources.find((item) => item.id === point.sourceRecordId);
  const account = data.accounts.find((item) => item.id === source?.accountId);
  return (
    <li key={point.id} className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm">
          {t(`pointKinds.${point.kind}`, { defaultValue: point.kind })}
          {point.label ? ` · ${point.label}` : ''}
        </p>
        <p className="break-words">{point.value}</p>
        <p className="break-words text-sm text-muted-foreground">
          {point.sourceRecordId
            ? (account?.label ?? account?.provider ?? t('person.unknownSource'))
            : t('person.local')}
        </p>
        {point.countryCode && (
          <p className="text-sm">{t('person.country', { country: point.countryCode })}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {!point.active && <Badge variant="outline">{t('person.inactive')}</Badge>}
          {point.preferred && <Badge variant="secondary">{t('person.preferred')}</Badge>}
        </div>
      </div>
      <CopyValue key={point.value} value={point.value} />
    </li>
  );
}
