import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';

import { Button, PageHeader } from '@pops/ui';

import { describeContactError } from '../errors';
import { contactGateway } from './api';
import { ContactIdentityFields } from './ContactIdentityFields';
import { useEntityCatalogue } from './useEntityCatalogue';

import type { Entity } from '../contacts-api/types.gen';
import type { ContactCreationGateway } from './api';

/** Create one explicitly typed entity, then continue to its add-as-needed contact editor. */
export function CreateContactPanel({
  gateway = contactGateway,
}: {
  gateway?: ContactCreationGateway;
}) {
  const { t } = useTranslation('contacts');
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [selectedType, setType] = useState<string | null>(null);
  const catalogue = useEntityCatalogue(gateway);
  const type = selectedType ?? catalogue.data?.defaultType ?? '';
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function create() {
    if (saving || !name.trim() || !catalogue.isSuccess) return;
    setSaving(true);
    setError(null);
    try {
      const entity = await gateway.create(name.trim(), type);
      await navigate(contactPath(entity));
    } catch (failure) {
      setError(failure instanceof Error ? failure : new Error(t('errors.saveFailed')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4 text-sm md:p-6">
      <PageHeader title={t('create.title')} backHref="/contacts" renderLink={Link} />
      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">{t('create.description')}</p>
        {error && <p role="alert">{describeContactError(error, t)}</p>}
        {catalogue.isError && (
          <p role="alert">
            {describeContactError(catalogue.error, t)}{' '}
            <Button variant="outline" onClick={() => void catalogue.refetch()}>
              {t('chooser.retryTypes')}
            </Button>
          </p>
        )}
        <ContactIdentityFields
          name={name}
          type={type}
          disabled={saving || !catalogue.isSuccess}
          types={catalogue.data?.types ?? []}
          changeName={setName}
          changeType={setType}
        />
        <Button
          className="min-h-11"
          disabled={saving || !name.trim() || !catalogue.isSuccess}
          onClick={() => void create()}
        >
          {t('create.submit')}
        </Button>
      </section>
    </main>
  );
}

function contactPath(entity: Entity): string {
  if (entity.type === 'person') return `/contacts/people/${entity.id}`;
  if (entity.type === 'company' || entity.type === 'organisation')
    return `/contacts/entities/${entity.id}`;
  return `/contacts/${entity.id}`;
}
