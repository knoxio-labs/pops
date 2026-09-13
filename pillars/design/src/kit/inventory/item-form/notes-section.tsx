/**
 * Port of
 * `pillars/inventory/app/src/pages/item-form-page/sections/NotesSection.tsx`.
 *
 * The source renders the preview through `react-markdown` +
 * `rehype-sanitize`; neither is a dependency of `@pops/design`, and adding
 * one is out of scope for a kit file. The preview below renders the same
 * text with line breaks preserved (`whitespace-pre-wrap`) instead of parsed
 * markdown: the "Nothing to preview" branch, the toggle button and its
 * icons, and every className are otherwise unchanged.
 */
import { Eye, Pencil } from 'lucide-react';

import { Button, Textarea } from '@pops/ui';

export interface NotesSectionProps {
  notes: string;
  notesPreview: boolean;
  onChangeNotes: (value: string) => void;
  onTogglePreview: () => void;
}

export function NotesSection({
  notes,
  notesPreview,
  onChangeNotes,
  onTogglePreview,
}: NotesSectionProps) {
  return (
    <section className="space-y-4 p-6 rounded-2xl border-2 border-app-accent/10 bg-card/50 shadow-sm shadow-app-accent/5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-app-accent" />
          Notes
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onTogglePreview}
          className="text-xs text-muted-foreground"
        >
          {notesPreview ? (
            <>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5 mr-1" /> Preview
            </>
          )}
        </Button>
      </div>
      {notesPreview ? (
        <div className="prose prose-sm dark:prose-invert max-w-none min-h-[6.5rem] p-3 rounded-md border bg-muted/30">
          {notes ? (
            <p className="whitespace-pre-wrap">{notes}</p>
          ) : (
            <p className="text-muted-foreground italic">Nothing to preview</p>
          )}
        </div>
      ) : (
        <Textarea
          name="notes"
          value={notes}
          onChange={(e) => onChangeNotes(e.target.value)}
          rows={4}
          placeholder="Add notes about this item... (supports markdown)"
          className="w-full bg-transparent"
        />
      )}
    </section>
  );
}
