import { ExternalLink } from 'lucide-react';

import { Button, Textarea, TextInput } from '@pops/ui';

import { CaptureAttachments } from './attachments';
import { CaptureDates } from './dates';
import { CaptureKinds } from './kinds';
import { captureLabel, safeCaptureLink } from './model';
import { CaptureVisit } from './references';

import type { CapturedItem } from './model';

/** Enrich the same source record in place; type changes retain text, URLs, dates and files. */
export function CaptureEditor({
  item,
  change,
}: {
  item: CapturedItem;
  change: (next: CapturedItem) => void;
}) {
  return (
    <div className="space-y-3 border-t border-foreground/15 pt-3" aria-label="Capture editor">
      <TextInput
        aria-label="Capture title"
        placeholder={captureLabel({ ...item, title: '' })}
        variant="ghost"
        containerClassName="bg-transparent px-0"
        key={`${item.id}:${item.title}`}
        defaultValue={item.title}
        onBlur={(event) => {
          if (event.currentTarget.value !== item.title)
            change({ ...item, title: event.currentTarget.value });
        }}
      />
      <CaptureKinds value={item.kind} onChange={(kind) => change({ ...item, kind })} />
      <CaptureText item={item} change={change} />
      <CaptureURL item={item} change={change} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 sm:max-w-80">
          <CaptureVisit value={item.visitId} onChange={(visitId) => change({ ...item, visitId })} />
        </div>
        <CaptureDates item={item} change={change} />
        <CaptureAttachments files={item.files} onChange={(files) => change({ ...item, files })} />
      </div>
    </div>
  );
}

function CaptureText({
  item,
  change,
}: {
  item: CapturedItem;
  change: (next: CapturedItem) => void;
}) {
  return (
    <Textarea
      aria-label="Captured text"
      placeholder="Text"
      className="min-h-20 border-foreground/20"
      key={`${item.id}:${item.text}`}
      defaultValue={item.text}
      onBlur={(event) => {
        if (event.currentTarget.value !== item.text)
          change({ ...item, text: event.currentTarget.value });
      }}
    />
  );
}

function CaptureURL({
  item,
  change,
}: {
  item: CapturedItem;
  change: (next: CapturedItem) => void;
}) {
  const link = safeCaptureLink(item.url);
  return (
    <div className="flex items-start gap-2">
      <TextInput
        aria-label="Captured URL"
        placeholder="URL"
        variant="ghost"
        containerClassName="bg-transparent px-0"
        key={`${item.id}:${item.url}`}
        defaultValue={item.url}
        error={item.url && !link ? 'Use an HTTP or HTTPS URL' : undefined}
        onBlur={(event) => {
          if (event.currentTarget.value !== item.url)
            change({ ...item, url: event.currentTarget.value });
        }}
      />
      {link && (
        <Button asChild variant="ghost" size="icon" aria-label="Open captured link">
          <a href={link} target="_blank" rel="noreferrer" aria-label="Open captured link">
            <ExternalLink className="size-4" aria-hidden />
          </a>
        </Button>
      )}
    </div>
  );
}
