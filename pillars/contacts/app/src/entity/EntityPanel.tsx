import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Badge, Button, PageHeader, Skeleton } from '@pops/ui';

import { describeContactError } from '../errors';
import { AddAddress, AddContactPoint } from '../person/AddFact';
import { CopyValue } from '../person/CopyValue';
import { contactGateway } from './api';
import { EntityDetailsFields } from './EntityDetailsFields';
import { useEntityDetails } from './useEntityDetails';

import type { ContactPoint, ContactPointInput } from '../contacts-api/types.gen';
import type { ContactGateway, ContactSnapshot } from './api';
import type { EntityDetailsModel } from './useEntityDetails';

/** Show local contact methods first for an organisation or company using Contacts' own API. */
export function EntityPanel({
  id,
  gateway = contactGateway,
}: {
  id: string;
  gateway?: ContactGateway;
}) {
  const model = useEntityDetails(id, gateway);
  const { t } = useTranslation('contacts');
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 text-sm md:p-6">
      <PageHeader
        title={
          <span className="block text-2xl font-semibold leading-tight tracking-normal">
            {model.data?.entity.name ?? t('entity.title')}
          </span>
        }
        backHref="/contacts"
        renderLink={Link}
        breadcrumbs={[{ label: t('nav.title'), href: '/contacts' }, { label: t('entity.title') }]}
      />
      <EntityFailure model={model} />
      {model.query.isPending && (
        <Skeleton aria-label={t('person.loading')} className="h-64 w-full" />
      )}
      {model.data && <EntityContent model={model} />}
    </main>
  );
}

function EntityFailure({ model }: { model: EntityDetailsModel }) {
  const { t } = useTranslation('contacts');
  if (!model.error) return null;
  return (
    <div role="alert" className="space-y-3 rounded-lg border border-destructive p-4">
      <p>{describeContactError(model.error, t)}</p>
      <Button
        variant="outline"
        className="min-h-11"
        disabled={model.saving}
        onClick={() => void model.query.refetch()}
      >
        {t('person.reload')}
      </Button>
    </div>
  );
}

function EntityContent({ model }: { model: EntityDetailsModel }) {
  const { data } = model;
  if (!data) return null;
  return (
    <>
      <EntityMethods
        points={data.points}
        disabled={model.saving || model.query.isFetching}
        onAdd={model.addPoint}
      />
      <EntityAddresses
        addresses={data.addresses}
        disabled={model.saving || model.query.isFetching}
        onAdd={model.addAddress}
      />
      <EntityDetailsFields
        name={model.currentName}
        notes={model.currentNotes}
        dirty={model.dirty}
        saving={model.saving}
        onNameChange={model.changeName}
        onNotesChange={model.changeNotes}
        onSave={() => void model.saveDetails()}
        onUndo={model.undoDetails}
      />
    </>
  );
}

function EntityMethods({
  points,
  disabled,
  onAdd,
}: {
  points: ContactSnapshot['points'];
  disabled: boolean;
  onAdd: (point: ContactPointInput) => Promise<boolean>;
}) {
  const { t } = useTranslation('contacts');
  return (
    <section
      aria-label={t('entity.methods')}
      className="space-y-3 rounded-xl border border-border bg-card p-4"
    >
      <h2 className="text-base font-semibold leading-tight tracking-normal">
        {t('entity.methods')}
      </h2>
      {points.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('person.noMethods')}</p>
      )}
      <ul className="divide-y divide-border">
        {points.map((point) => (
          <EntityPoint key={point.id} point={point} />
        ))}
      </ul>
      <AddContactPoint disabled={disabled} onAdd={onAdd} />
    </section>
  );
}

function EntityAddresses({
  addresses,
  disabled,
  onAdd,
}: {
  addresses: ContactSnapshot['addresses'];
  disabled: boolean;
  onAdd: (value: string) => Promise<boolean>;
}) {
  const { t } = useTranslation('contacts');
  return (
    <section
      aria-label={t('entity.addresses')}
      className="space-y-3 rounded-xl border border-border bg-card p-4"
    >
      <h2 className="text-base font-semibold leading-tight tracking-normal">
        {t('entity.addresses')}
      </h2>
      {addresses.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('person.noAddresses')}</p>
      )}
      <ul className="divide-y divide-border">
        {addresses.map((address) => (
          <li key={address.id} className="flex items-start gap-3 py-3">
            <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">{address.value}</p>
            <CopyValue value={address.value} />
          </li>
        ))}
      </ul>
      <AddAddress disabled={disabled} onAdd={onAdd} />
    </section>
  );
}

function EntityPoint({ point }: { point: ContactPoint }) {
  const { t } = useTranslation('contacts');
  return (
    <li className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs text-muted-foreground">
          {t(`pointKinds.${point.kind}`, { defaultValue: point.kind })}
          {point.label ? ` · ${point.label}` : ''}
        </p>
        <p className="break-words text-sm">{point.value}</p>
        <p className="text-xs text-muted-foreground">{t('person.local')}</p>
        {point.preferred && <Badge variant="secondary">{t('person.preferred')}</Badge>}
      </div>
      <CopyValue value={point.value} />
    </li>
  );
}
