import { Paperclip, X } from 'lucide-react';

import { Button, ComboboxSelect } from '@pops/ui';

import { useEventDetails } from './model';

/** Linking selects an original document identity; the prototype does not fabricate file contents. */
export function EventDocuments() {
  const { data, change } = useEventDetails();
  const ids = data.metadata.documentIds;
  return (
    <section aria-label="Event documents" className="space-y-1">
      {ids.map((id) => (
        <div key={id} className="flex min-h-11 items-center gap-2 text-sm">
          <Paperclip className="size-4 text-muted-foreground" aria-hidden />
          <span className="flex-1">
            {data.references.find((r) => r.id === id)?.name ?? 'Document unavailable'}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Unlink document"
            onClick={() =>
              change({
                ...data,
                metadata: { ...data.metadata, documentIds: ids.filter((value) => value !== id) },
              })
            }
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      ))}
      <div className="max-w-80">
        <ComboboxSelect
          aria-label="Link document"
          variant="ghost"
          placeholder="Link document"
          value={[]}
          options={data.references
            .filter((r) => r.kind === 'document' && !ids.includes(r.id))
            .map((r) => ({ value: r.id, label: r.name }))}
          onChange={(value) => {
            if (typeof value === 'string' && !ids.includes(value))
              change({ ...data, metadata: { ...data.metadata, documentIds: [...ids, value] } });
          }}
        />
      </div>
    </section>
  );
}
