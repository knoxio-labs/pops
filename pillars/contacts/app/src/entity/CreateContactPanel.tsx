import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';

import { Button, PageHeader, Select, TextInput } from '@pops/ui';

import { describeContactError } from '../errors';
import { contactGateway } from './api';

import type { ContactGateway } from './api';

const entityTypes = ['person', 'company', 'organisation'];

/** Create one explicitly typed entity, then continue to its add-as-needed contact editor. */
export function CreateContactPanel({ gateway = contactGateway }: { gateway?: ContactGateway }) {
  const { t } = useTranslation('contacts');
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [type, setType] = useState('person');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function create() {
    if (saving || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const entity = await gateway.create(name.trim(), type);
      await navigate(
        entity.type === 'person'
          ? `/contacts/people/${entity.id}`
          : `/contacts/entities/${entity.id}`
      );
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
        <TextInput
          label={t('entity.name')}
          className="text-sm"
          containerClassName="min-h-11"
          value={name}
          disabled={saving}
          onChange={(event) => setName(event.target.value)}
        />
        <Select
          aria-label={t('create.type')}
          className="min-h-11 text-sm"
          value={type}
          options={entityTypes.map((value) => ({ value, label: t(`entityTypes.${value}`) }))}
          onChange={(event) => {
            if (entityTypes.includes(event.target.value)) setType(event.target.value);
          }}
        />
        <Button
          className="min-h-11"
          disabled={saving || !name.trim()}
          onClick={() => void create()}
        >
          {t('create.submit')}
        </Button>
      </section>
    </main>
  );
}
