import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import { PageHeader, Skeleton } from '@pops/ui';

import { contactGateway } from '../entity/api';
import { EntityPanel } from '../entity/EntityPanel';
import { describeContactError } from '../errors';
import { personGateway } from '../person/api';
import { PersonPanel } from '../person/PersonPanel';

import type { Entity } from '../contacts-api/types.gen';

/** Resolve a canonical contact URI into the existing detail surface for its entity type. */
export function ContactReferencePage({
  load = loadContact,
}: {
  load?: (id: string) => Promise<Entity>;
}) {
  const { t } = useTranslation('contacts');
  const { entityId = '' } = useParams<{ entityId: string }>();
  const query = useQuery({
    queryKey: ['contacts-reference', entityId],
    queryFn: () => load(entityId),
    retry: false,
  });
  if (query.isPending) return <Skeleton aria-label={t('person.loading')} className="m-4 h-64" />;
  if (query.error)
    return (
      <p role="alert" className="m-4">
        {describeContactError(query.error, t)}
      </p>
    );
  const entity = query.data;
  if (!entity) return null;
  if (entity.type === 'person') return <PersonPanel id={entity.id} gateway={personGateway} />;
  if (entity.type === 'company' || entity.type === 'organisation')
    return <EntityPanel id={entity.id} />;
  return <EntitySummary entity={entity} />;
}

async function loadContact(id: string): Promise<Entity> {
  const { entity } = await contactGateway.resolve(id);
  return entity;
}

function EntitySummary({ entity }: { entity: Entity }) {
  const { t } = useTranslation('contacts');
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 text-sm md:p-6">
      <PageHeader
        title={
          <span className="block text-2xl font-semibold leading-tight tracking-normal">
            {entity.name}
          </span>
        }
        backHref="/contacts"
        renderLink={Link}
      />
      <dl className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          <dt className="font-medium">{t('reference.type')}</dt>
          <dd>{entity.type}</dd>
        </div>
        {entity.notes && (
          <div className="space-y-1">
            <dt className="font-medium">{t('person.notes')}</dt>
            <dd className="whitespace-pre-wrap break-words">{entity.notes}</dd>
          </div>
        )}
      </dl>
    </main>
  );
}
