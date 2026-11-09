import { Plus, Trash2 } from 'lucide-react';

import { Button, TextInput } from '@pops/ui';

import type { ContactDraft } from './model';

type Section = 'methods' | 'addresses';
type Row = ContactDraft['methods'][number] | ContactDraft['addresses'][number];
const fields = {
  methods: [
    { key: 'label', label: 'Label' },
    { key: 'value', label: 'Value' },
  ],
  addresses: [
    { key: 'label', label: 'Label' },
    { key: 'value', label: 'Address' },
    { key: 'city', label: 'City' },
  ],
} as const;

function rowValue(row: Row, key: 'label' | 'value' | 'city') {
  if (key === 'city') return 'city' in row ? row.city : '';
  return row[key];
}

function ContactRow({
  row,
  index,
  section,
  change,
  remove,
}: {
  row: Row;
  index: number;
  section: Section;
  change: (key: 'label' | 'value' | 'city', value: string) => void;
  remove: () => void;
}) {
  const noun = section === 'methods' ? 'method' : 'address';
  return (
    <fieldset className="space-y-3 rounded-lg border border-border bg-background p-3">
      <legend className="px-1 text-xs text-muted-foreground">
        {section === 'methods' ? 'Method' : 'Address'} {index + 1}
      </legend>
      {fields[section].map(({ key, label }) => (
        <TextInput
          key={key}
          label={label}
          aria-label={`${label} ${index + 1}`}
          className="text-sm"
          containerClassName="min-h-11"
          value={rowValue(row, key)}
          onChange={(event) => change(key, event.target.value)}
        />
      ))}
      <Button
        type="button"
        variant="ghost"
        className="min-h-11 text-sm text-muted-foreground"
        aria-label={`Remove ${noun} ${index + 1}`}
        onClick={remove}
      >
        <Trash2 className="size-4" aria-hidden /> Remove
      </Button>
    </fieldset>
  );
}

/** Edits repeatable source facts without interpreting labels or requiring complete addresses. */
export function ContactRows({
  draft,
  update,
  section,
}: {
  draft: ContactDraft;
  update: (draft: ContactDraft) => void;
  section: Section;
}) {
  const rows = draft[section];
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <ContactRow
          key={row.id}
          row={row}
          index={index}
          section={section}
          change={(key, value) =>
            update({
              ...draft,
              [section]: rows.map((item) =>
                item.id === row.id ? { ...item, [key]: value } : item
              ),
            })
          }
          remove={() => update({ ...draft, [section]: rows.filter((item) => item.id !== row.id) })}
        />
      ))}
      <Button
        type="button"
        variant="ghost"
        className="min-h-11 text-sm text-app-accent"
        onClick={() => {
          const id = crypto.randomUUID();
          update(
            section === 'methods'
              ? { ...draft, methods: [...draft.methods, { id, label: '', value: '' }] }
              : {
                  ...draft,
                  addresses: [...draft.addresses, { id, label: '', value: '', city: '' }],
                }
          );
        }}
      >
        <Plus className="size-4" aria-hidden /> Add {section === 'methods' ? 'method' : 'address'}
      </Button>
    </div>
  );
}
