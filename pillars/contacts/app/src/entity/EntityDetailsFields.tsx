import { RotateCcw, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button, Textarea, TextInput } from '@pops/ui';

/** Edit local entity details with explicit save and undo actions. */
export function EntityDetailsFields({
  name,
  notes,
  dirty,
  saving,
  onNameChange,
  onNotesChange,
  onSave,
  onUndo,
}: {
  name: string;
  notes: string;
  dirty: boolean;
  saving: boolean;
  onNameChange: (name: string) => void;
  onNotesChange: (notes: string) => void;
  onSave: () => void;
  onUndo: () => void;
}) {
  const { t } = useTranslation('contacts');
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h2 className="text-base font-semibold leading-tight tracking-normal">
        {t('person.details')}
      </h2>
      <TextInput
        label={t('entity.name')}
        className="text-sm"
        value={name}
        disabled={saving}
        onChange={(event) => onNameChange(event.target.value)}
      />
      <Textarea
        aria-label={t('person.notes')}
        className="min-h-24 text-sm"
        value={notes}
        disabled={saving}
        onChange={(event) => onNotesChange(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11" disabled={!dirty || saving || !name.trim()} onClick={onSave}>
          <Save className="size-4" aria-hidden />
          {t('person.save')}
        </Button>
        <Button variant="outline" className="min-h-11" disabled={!dirty || saving} onClick={onUndo}>
          <RotateCcw className="size-4" aria-hidden />
          {t('person.undo')}
        </Button>
      </div>
    </section>
  );
}
