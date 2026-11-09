import { ArrowDownToLine, Tags } from 'lucide-react';

import { Button, Popover, PopoverContent, PopoverTrigger, Textarea, TextInput } from '@pops/ui';

import { CaptureAttachments } from '../trip-quick-capture/attachments';
import { CaptureFileChips } from '../trip-quick-capture/file-chips';
import { CaptureKinds } from '../trip-quick-capture/kinds';
import { captureKinds, hasCapture } from '../trip-quick-capture/model';

import type { CaptureDraft } from '../trip-quick-capture/model';

type ComposerProps = {
  draft: CaptureDraft;
  change: (next: CaptureDraft) => void;
  capture: () => void;
};

/** Capture verbatim text and actual files; classification stays an optional explicit choice. */
export function InboxComposer({ draft, change, capture }: ComposerProps) {
  return (
    <section
      aria-label="Quick capture"
      className="space-y-2 rounded-xl border border-border bg-card p-3 focus-within:ring-2 focus-within:ring-ring/50"
    >
      <Textarea
        aria-label="Capture text"
        placeholder="Paste or type…"
        className="min-h-20 resize-none border-0 bg-transparent p-2 shadow-none focus-visible:ring-0 dark:bg-transparent"
        value={draft.text}
        onChange={(event) => change({ ...draft, text: event.currentTarget.value })}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && hasCapture(draft)) {
            event.preventDefault();
            capture();
          }
        }}
      />
      {draft.files.length > 0 && (
        <p className="text-xs text-muted-foreground">Selected files · not uploaded</p>
      )}
      <CaptureFileChips files={draft.files} onChange={(files) => change({ ...draft, files })} />
      {draft.kind === 'link' && (
        <TextInput
          aria-label="Capture URL"
          placeholder="URL"
          value={draft.url}
          onChange={(event) => change({ ...draft, url: event.currentTarget.value })}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          <CaptureAttachments
            compact
            files={draft.files}
            onChange={(files) => change({ ...draft, files })}
          />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost">
                <Tags className="size-4" />
                {captureKinds.find((kind) => kind.id === draft.kind)?.label ?? 'Type'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <CaptureKinds value={draft.kind} onChange={(kind) => change({ ...draft, kind })} />
            </PopoverContent>
          </Popover>
        </div>
        <Button disabled={!hasCapture(draft)} onClick={capture}>
          <ArrowDownToLine className="size-4" />
          Capture
        </Button>
      </div>
    </section>
  );
}
