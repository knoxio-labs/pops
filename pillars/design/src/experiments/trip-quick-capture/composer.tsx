import { ArrowDownToLine, Link2 } from 'lucide-react';

import { Button, Textarea, TextInput } from '@pops/ui';

import { CaptureAttachments } from './attachments';
import { CaptureFileChips } from './file-chips';
import { CaptureKinds } from './kinds';
import { candidateLink, hasCapture, safeCaptureLink } from './model';
import { CaptureVisit } from './references';

import type { CaptureDraft } from './model';

/** Keep source entry minimal; optional type, destination and attachments never discard a draft. */
export function CaptureComposer({
  layout,
  draft,
  change,
  capture,
}: {
  layout: 'text' | 'type';
  draft: CaptureDraft;
  change: (next: CaptureDraft) => void;
  capture: () => void;
}) {
  const enabled = hasCapture(draft) && (layout === 'text' || Boolean(draft.kind));
  const kinds = <CaptureKinds value={draft.kind} onChange={(kind) => change({ ...draft, kind })} />;
  return (
    <section
      aria-label="Quick capture"
      className="space-y-3 rounded-xl border border-foreground/30 bg-muted/60 p-3 shadow-sm"
    >
      {layout === 'type' && kinds}
      {(layout === 'text' || draft.kind) && (
        <>
          <div className="relative">
            <Textarea
              aria-label="Capture text"
              placeholder="Paste or type…"
              className="min-h-28 border-foreground/20 bg-background/40 pb-14 text-foreground"
              value={draft.text}
              onChange={(event) => change({ ...draft, text: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && enabled) {
                  event.preventDefault();
                  capture();
                }
              }}
            />
            <div className="absolute right-2 bottom-2">
              <CaptureAttachments
                compact
                files={draft.files}
                onChange={(files) => change({ ...draft, files })}
              />
            </div>
          </div>
          <CaptureFileChips files={draft.files} onChange={(files) => change({ ...draft, files })} />
          {layout === 'text' && kinds}
          <CaptureSource draft={draft} change={change} />
          <CaptureActions draft={draft} change={change} capture={capture} enabled={enabled} />
        </>
      )}
    </section>
  );
}

function CaptureActions({
  draft,
  change,
  capture,
  enabled,
}: {
  draft: CaptureDraft;
  change: (next: CaptureDraft) => void;
  capture: () => void;
  enabled: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        <div className="w-48 max-w-full">
          <CaptureVisit
            value={draft.visitId}
            onChange={(visitId) => change({ ...draft, visitId })}
          />
        </div>
      </div>
      <Button disabled={!enabled} onClick={capture}>
        <ArrowDownToLine className="size-4" aria-hidden />
        Capture
      </Button>
    </div>
  );
}

function CaptureSource({
  draft,
  change,
}: {
  draft: CaptureDraft;
  change: (next: CaptureDraft) => void;
}) {
  const candidate = candidateLink(draft.text);
  return (
    <>
      {candidate && candidate !== safeCaptureLink(draft.url) && (
        <Button
          variant="outline"
          onClick={() => change({ ...draft, kind: 'link', url: candidate })}
        >
          <Link2 className="size-4" aria-hidden />
          Use link
        </Button>
      )}
      {(draft.kind === 'link' || draft.url) && (
        <TextInput
          aria-label="Capture URL"
          placeholder="URL"
          variant="ghost"
          containerClassName="bg-transparent"
          value={draft.url}
          onChange={(event) => change({ ...draft, url: event.target.value })}
          error={draft.url && !safeCaptureLink(draft.url) ? 'Use an HTTP or HTTPS URL' : undefined}
        />
      )}
    </>
  );
}
