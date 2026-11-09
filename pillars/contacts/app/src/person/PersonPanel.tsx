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
    <main className="mx-auto max-w-3xl space-y-5 p-4 text-sm md:p-6">
      <PageHeader
        title={
          <span className="block text-2xl font-semibold leading-tight tracking-normal">
            {model.data?.entity.name ?? t('person.title')}
          </span>
        }
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
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <TextInput
          label={t('person.name')}
          className="text-sm"
          value={draft.name}
          disabled={model.saving}
          onChange={(event) => setHistory([...history, { ...draft, name: event.target.value }])}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            className="min-h-11 bg-app-accent text-app-accent-foreground text-sm hover:bg-app-accent/90"
            disabled={disabled || !dirty || !draft.name.trim()}
            onClick={() => void save()}
          >
            <Save className="size-4" aria-hidden />
            {t('person.save')}
          </Button>
          <Button
            variant="outline"
            className="min-h-11 text-sm"
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
      <PersonNotes
        value={draft.notes}
        disabled={model.saving}
        change={(notes) => setHistory([...history, { ...draft, notes }])}
      />
    </>
  );
}

function PersonNotes({
  value,
  disabled,
  change,
}: {
  value: string;
  disabled: boolean;
  change: (value: string) => void;
}) {
  const { t } = useTranslation('contacts');
  return (
    <section
      aria-label={t('person.notes')}
      className="space-y-3 rounded-xl border border-border bg-card p-4"
    >
      <h2 className="text-base font-semibold leading-tight tracking-normal">{t('person.notes')}</h2>
      <Textarea
        aria-label={t('person.notes')}
        className="min-h-24 text-sm"
        value={value}
        disabled={disabled}
        onChange={(event) => change(event.target.value)}
      />
    </section>
  );
}
