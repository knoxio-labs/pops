import { RotateCcw, Save } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Button, PageHeader, Skeleton, Textarea, TextInput } from '@pops/ui';

import { describeContactError } from '../errors';
import { PersonFacts } from './PersonFacts';
import { usePerson } from './usePerson';

import type { PersonDraft, PersonGateway, PersonSnapshot } from './contracts';

/** Load a person with explicit recovery and keep the editor mounted while refreshing failed writes. */
export function PersonPanel({ id, gateway }: { id: string; gateway: PersonGateway }) {
  const { t } = useTranslation('contacts');
  const model = usePerson(id, gateway);
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
      <PageHeader
        title={model.data?.entity.name ?? t('person.title')}
        backHref="/contacts"
        renderLink={Link}
        breadcrumbs={[{ label: t('nav.title'), href: '/contacts' }, { label: t('person.title') }]}
      />
      {model.error && (
        <div role="alert" className="space-y-3 rounded-lg border border-destructive p-4">
          <p>{describeContactError(model.error, t)}</p>
          {model.uncertain && <p>{t('person.uncertain')}</p>}
          <Button
            variant="outline"
            disabled={model.saving || model.isFetching}
            onClick={() => void model.reload()}
          >
            {t('person.reload')}
          </Button>
        </div>
      )}
      {model.success && <p role="status">{t('person.saved')}</p>}
      {model.isPending && (
        <div aria-label={t('person.loading')} className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}
      {model.data && <PersonEditor data={model.data} model={model} />}
    </main>
  );
}

function PersonEditor({
  data,
  model,
}: {
  data: PersonSnapshot;
  model: ReturnType<typeof usePerson>;
}) {
  const { t } = useTranslation('contacts');
  const [history, setHistory] = useState<PersonDraft[]>([]);
  const draft = history.at(-1) ?? { name: data.entity.name, notes: data.entity.notes ?? '' };
  const dirty = draft.name !== data.entity.name || draft.notes !== (data.entity.notes ?? '');
  const disabled = model.saving || model.isFetching || model.isError || model.uncertain;
  async function save() {
    if (await model.save(draft)) setHistory([]);
  }
  return (
    <>
      <div className="space-y-3 rounded-xl border bg-app-accent/10 p-4">
        <TextInput
          label={t('person.name')}
          value={draft.name}
          disabled={model.saving}
          onChange={(event) => setHistory([...history, { ...draft, name: event.target.value }])}
        />
        <div className="flex flex-wrap gap-2">
          <Button disabled={disabled || !dirty || !draft.name.trim()} onClick={() => void save()}>
            <Save className="size-4" aria-hidden />
            {t('person.save')}
          </Button>
          <Button
            variant="outline"
            disabled={model.saving || history.length === 0}
            onClick={() => setHistory(history.slice(0, -1))}
          >
            <RotateCcw className="size-4" aria-hidden />
            {t('person.undo')}
          </Button>
        </div>
      </div>
      <PersonFacts
        data={data}
        disabled={disabled}
        addPoint={model.addPoint}
        addAddress={model.addAddress}
      />
      <section aria-label={t('person.notes')} className="space-y-3 rounded-xl border p-4">
        <h2 className="text-lg font-semibold">{t('person.notes')}</h2>
        <Textarea
          aria-label={t('person.notes')}
          value={draft.notes}
          disabled={model.saving}
          onChange={(event) => setHistory([...history, { ...draft, notes: event.target.value }])}
        />
      </section>
    </>
  );
}
