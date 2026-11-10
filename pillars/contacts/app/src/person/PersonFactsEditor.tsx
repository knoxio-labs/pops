import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import { AddressEditor } from './AddressEditor';
import { PointEditor } from './PointEditor';

import type { ReactNode } from 'react';

import type { PersonSnapshot } from './contracts';
import type { PersonDraft } from './draft';

interface FactsEditorProps {
  data: PersonSnapshot;
  draft: PersonDraft;
  disabled: boolean;
  change: (draft: PersonDraft) => void;
}

/** One details-first editing surface shares its draft and undo history with name and notes. */
export function PersonFactsEditor(props: FactsEditorProps) {
  return (
    <>
      <MethodSection {...props} />
      <AddressSection {...props} />
    </>
  );
}

function MethodSection({ data, draft, disabled, change }: FactsEditorProps) {
  const { t } = useTranslation('contacts');
  return (
    <FactSection
      title={t('person.methods')}
      addLabel={t('person.addMethod')}
      disabled={disabled}
      add={() =>
        change({
          ...draft,
          points: [
            ...draft.points,
            { id: crypto.randomUUID(), kind: 'email', value: '', label: '', countryCode: '' },
          ],
        })
      }
    >
      {draft.points.length === 0 && (
        <p className="p-3 text-muted-foreground">{t('person.noMethods')}</p>
      )}
      <ul>
        {draft.points.map((point, index) => (
          <PointEditor
            key={point.id}
            point={point}
            data={data}
            index={index}
            disabled={disabled}
            change={(next) =>
              change({
                ...draft,
                points: draft.points.map((item) => (item.id === point.id ? next : item)),
              })
            }
            remove={() =>
              change({ ...draft, points: draft.points.filter((item) => item.id !== point.id) })
            }
          />
        ))}
      </ul>
    </FactSection>
  );
}

function AddressSection({ draft, disabled, change }: FactsEditorProps) {
  const { t } = useTranslation('contacts');
  return (
    <FactSection
      title={t('person.addresses')}
      addLabel={t('person.addAddress')}
      disabled={disabled}
      add={() =>
        change({
          ...draft,
          addresses: [
            ...draft.addresses,
            { id: crypto.randomUUID(), value: '', label: '', city: '' },
          ],
        })
      }
    >
      {draft.addresses.length === 0 && (
        <p className="p-3 text-muted-foreground">{t('person.noAddresses')}</p>
      )}
      <ul>
        {draft.addresses.map((address, index) => (
          <AddressEditor
            key={address.id}
            address={address}
            index={index}
            disabled={disabled}
            change={(next) =>
              change({
                ...draft,
                addresses: draft.addresses.map((item) => (item.id === address.id ? next : item)),
              })
            }
            remove={() =>
              change({
                ...draft,
                addresses: draft.addresses.filter((item) => item.id !== address.id),
              })
            }
          />
        ))}
      </ul>
    </FactSection>
  );
}

function FactSection({
  title,
  addLabel,
  disabled,
  add,
  children,
}: {
  title: string;
  addLabel: string;
  disabled: boolean;
  add: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation('contacts');
  return (
    <section aria-label={title} className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-base font-semibold leading-tight tracking-normal">{title}</h2>
        <Button
          variant="outline"
          className="min-h-11 text-sm"
          disabled={disabled}
          onClick={add}
          aria-label={addLabel}
        >
          <Plus className="size-4" aria-hidden />
          {t('person.add')}
        </Button>
      </header>
      <div className="p-2">{children}</div>
    </section>
  );
}
