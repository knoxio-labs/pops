import { FileText } from 'lucide-react';

import { Chip, ComboboxSelect } from '@pops/ui';

import { useStay } from './context';

/** Link originals from the fictional catalogue; chips unlink without deleting source documents. */
export function StayDocuments() {
  const { state, change } = useStay();
  return (
    <section aria-label="Stay documents" className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {state.documentIds.map((id) => {
          const name =
            state.documents.find((item) => item.id === id)?.name ?? 'Document unavailable';
          return (
            <Chip
              key={id}
              variant="outline"
              className="min-h-11 text-sm"
              prefix={<FileText className="size-4 text-app-accent" aria-hidden />}
              removable
              removeLabel={`Unlink ${name}`}
              onRemove={() =>
                change({ ...state, documentIds: state.documentIds.filter((value) => value !== id) })
              }
            >
              {name}
            </Chip>
          );
        })}
      </div>
      <ComboboxSelect
        aria-label="Link stay document"
        placeholder="Link document"
        searchPlaceholder="Find a document…"
        value=""
        variant="ghost"
        className="w-fit"
        options={state.documents
          .filter((item) => !state.documentIds.includes(item.id))
          .map((item) => ({ value: item.id, label: item.name }))}
        onChange={(value) => {
          if (typeof value === 'string' && value && !state.documentIds.includes(value))
            change({ ...state, documentIds: [...state.documentIds, value] });
        }}
      />
    </section>
  );
}
