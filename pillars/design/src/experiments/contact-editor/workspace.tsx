import { RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@pops/ui';

import { useRouteState } from '../trip-route-editing/canvas-state';
import { createContactEditorState } from './fixture';
import { ContactForm } from './form';
import { ContactEditorHeader } from './identity';
import { saveContactDraft } from './model';
import { ContactEditorReview } from './review';

import type { ContactEditorScenario } from './model';

/** Compares bounded create/edit forms over identical facts, with history only for saved records. */
export function ContactEditorWorkspace({
  layout,
  scenario = 'new',
}: {
  layout: 'full' | 'progressive';
  scenario?: ContactEditorScenario;
}) {
  const history = useRouteState(() => createContactEditorState(scenario));
  const [revision, setRevision] = useState(0);
  const selected = history.state.contacts.find(
    (contact) => contact.id === history.state.selectedId
  );
  return (
    <div className="min-h-screen bg-background text-foreground">
      <ContactEditorReview layout={layout} />
      <main className="mx-auto max-w-xl space-y-4 px-4 py-6 md:py-8">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-muted-foreground">Contacts</span>
          <Button
            variant="ghost"
            className="min-h-11 text-sm"
            disabled={!history.canUndo}
            onClick={() => {
              history.undo();
              setRevision(revision + 1);
            }}
          >
            <RotateCcw className="size-4" aria-hidden /> Undo
          </Button>
        </div>
        <ContactEditorHeader selected={selected} />
        <ContactForm
          key={revision}
          state={history.state}
          progressive={layout === 'progressive'}
          save={(draft) => {
            const next = saveContactDraft({ ...history.state, draft }, crypto.randomUUID());
            if (next.error) return next.error;
            history.change(next);
            setRevision(revision + 1);
            return null;
          }}
        />
      </main>
    </div>
  );
}
