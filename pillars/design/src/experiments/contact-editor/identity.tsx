import { UserRound } from 'lucide-react';

import { directoryKinds } from '../contact-directory/model';

import type { DirectoryContact } from '../contact-directory/model';

/** Names the selected saved contact and its retained source independently of unsaved edits. */
export function ContactEditorHeader({ selected }: { selected?: DirectoryContact }) {
  return (
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold leading-tight tracking-normal">
        {selected ? 'Edit contact' : 'Create contact'}
      </h1>
      {selected && (
        <div
          aria-label="Selected contact"
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
        >
          <UserRound className="size-5 text-app-accent" aria-hidden />
          <div className="min-w-0">
            <p className="break-words text-sm font-medium">{selected.name}</p>
            <p className="text-xs text-muted-foreground">
              {directoryKinds.find(({ kind }) => kind === selected.kind)?.label} · {selected.origin}
            </p>
          </div>
        </div>
      )}
    </header>
  );
}
