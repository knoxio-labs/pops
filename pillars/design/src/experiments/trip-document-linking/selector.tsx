import { Search, Link2 } from 'lucide-react';
import { useState } from 'react';

import { Button, SearchPickerDialog, TextInput } from '@pops/ui';

import { useDocuments } from './context';
import { DocumentResult } from './documents';
import { attachSelected, filteredDocuments, pendingDocuments } from './model';

/** Link the selected existing originals to the explicit current target. */
export function LinkSelection({ onLinked }: { onLinked?: () => void }) {
  const { state, change } = useDocuments();
  const count = pendingDocuments(state).length;
  return (
    <Button
      disabled={!count || !state.targets.some((target) => target.id === state.targetId)}
      onClick={() => {
        change(attachSelected(state, () => crypto.randomUUID()));
        onLinked?.();
      }}
    >
      <Link2 className="size-4" />
      {count ? `Link ${count} ${count === 1 ? 'document' : 'documents'}` : 'Link documents'}
    </Button>
  );
}

/** Compare always-visible source selection against a focused search dialog on the same catalogue. */
export function DocumentSelector({ layout }: { layout: 'inline' | 'picker' }) {
  const { state, change } = useDocuments();
  const [open, setOpen] = useState(false);
  const results = filteredDocuments(state);
  if (layout === 'picker')
    return (
      <SearchPickerDialog
        trigger={
          <Button variant="outline">
            <Search className="size-4" />
            Choose documents
          </Button>
        }
        open={open}
        onOpenChange={setOpen}
        title="Choose documents"
        searchPlaceholder="Search documents"
        search={state.query}
        onSearchChange={(query) => change({ ...state, query })}
        isLoading={false}
        results={results}
        renderResult={(document) => <DocumentResult document={document} />}
        getResultKey={(document) => document.id}
        minChars={0}
        emptyMessage="No matching documents"
        trailing={<LinkSelection onLinked={() => setOpen(false)} />}
      />
    );
  return (
    <section aria-label="Existing documents" className="space-y-3 border-t pt-4">
      <h2 className="text-sm font-semibold">Existing documents</h2>
      <TextInput
        aria-label="Search documents"
        placeholder="Search documents"
        prefix={<Search className="size-4" />}
        value={state.query}
        onChange={(event) => change({ ...state, query: event.currentTarget.value })}
      />
      <div className="space-y-2">
        {results.map((document) => (
          <DocumentResult key={document.id} document={document} />
        ))}
        {!results.length && <p className="text-sm text-muted-foreground">No matching documents</p>}
      </div>
      <div className="flex justify-end">
        <LinkSelection />
      </div>
    </section>
  );
}
