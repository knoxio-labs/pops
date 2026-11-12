import { ArrowLeft, FileText, Lightbulb } from 'lucide-react';

import { Button, Input, Label, Textarea } from '@pops/ui';

import { date } from './source-details';

import type { CraftAccommodationGap, CraftTimeline } from '@/fixtures/trip-timeline-craft';

/** Text-first thought capture imposes no type, Visit or date. */
export function CraftThoughtComposer({
  text,
  onChange,
}: {
  text: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Label htmlFor="craft-thought">What's on your mind?</Label>
      <Textarea
        id="craft-thought"
        autoFocus
        value={text}
        onChange={(event) => onChange(event.target.value)}
        placeholder="A place, a plan, something to remember…"
      />
      <p className="flex gap-2 text-sm text-muted-foreground">
        <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden />A thought can stay an idea. No
        type or date is required.
      </p>
    </div>
  );
}

/** A gap supplies exact draft dates; a Considering stay does not claim coverage. */
export function CraftStayComposer({
  gap,
  text,
  onChange,
}: {
  gap: CraftAccommodationGap;
  text: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-muted/40 p-4 text-sm">
        <p className="font-medium">
          {date(gap.start)} – {date(gap.end)}
        </p>
        <p className="mt-1 text-muted-foreground">Check-in → Check-out</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="craft-stay">Place or accommodation</Label>
        <Input
          id="craft-stay"
          autoFocus
          value={text}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Somewhere you’re considering"
        />
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        This adds an idea. These nights still need accommodation until a stay is Agreed, Reserved or
        Purchased.
      </p>
    </div>
  );
}

/** Documents contains only explicit fixture references, without inferred file media types. */
export function CraftDocuments({
  timeline,
  onClose,
}: {
  timeline: CraftTimeline;
  onClose: () => void;
}) {
  return (
    <div className="space-y-5">
      {timeline.documents.map((document) => (
        <div key={document.id} className="flex items-start gap-3 border-b pb-4">
          <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <p className="text-sm font-medium">{document.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{document.source}</p>
          </div>
        </div>
      ))}
      {timeline.documents.length === 0 && (
        <p className="text-sm text-muted-foreground">No documents added.</p>
      )}
      <Button variant="ghost" className="gap-2" onClick={onClose}>
        <ArrowLeft className="size-4" aria-hidden />
        Return to timeline
      </Button>
    </div>
  );
}
