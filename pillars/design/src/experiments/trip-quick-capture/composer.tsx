import { ArrowDownToLine, Link2 } from 'lucide-react';

import { Button, Textarea, TextInput } from '@pops/ui';

import { CaptureAttachments } from './attachments';
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
          <Textarea
            aria-label="Capture text"
            placeholder="Paste or type…"
            className="min-h-24 border-foreground/20 bg-background/40 text-foreground"
            value={draft.text}
            onChange={(event) => change({ ...draft, text: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && enabled) {
                event.preventDefault();
                capture();
              }
            }}
          />
          {layout === 'text' && kinds}
          <CaptureSource draft={draft} change={change} />
          <CaptureActions draft={draft} change={change} capture={capture} enabled={enabled} />
          {draft.files.length > 0 && (
            <p className="text-xs text-foreground/80">
              {draft.files.map((file) => file.name).join(' · ')}
            </p>
          )}
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
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-foreground/15 pt-2">
      <div className="min-w-0 flex-1 sm:max-w-80">
        <CaptureVisit value={draft.visitId} onChange={(visitId) => change({ ...draft, visitId })} />
      </div>
      <CaptureAttachments files={draft.files} onChange={(files) => change({ ...draft, files })} />
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
