import { Badge, Button } from '@pops/ui';

/** Prototype questions and source contracts stay outside the proposed product UI. */
export function CaptureReview({ layout }: { layout: 'text' | 'type' }) {
  return (
    <aside className="space-y-2 border-b bg-muted/30 px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">D08 · Approved</Badge>
        <span className="text-xs text-muted-foreground">
          Fictional data · changes reset on reload
        </span>
        {(['text', 'type'] as const).map((id) => (
          <Button key={id} asChild variant={layout === id ? 'secondary' : 'ghost'}>
            <a target="_top" href={`/design/x/trip-quick-capture/${id}/s/trips/capture`}>
              {id === 'text' ? 'Text first' : 'Type first'}
            </a>
          </Button>
        ))}
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm">Proposals and questions</summary>
        <div className="space-y-2 pb-2 text-sm">
          <p>
            Text first accepts unclassified source material. Type first starts with an explicit
            category. Both retain the same text, URLs and browser files, and use the same enrichment
            controls.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Does choosing a type help capture, or slow it down?</li>
            <li>Is selecting a visit useful here, or should the inbox be enough?</li>
            <li>Can you add context later without re-entering the source?</li>
          </ol>
          <p>
            Try pasting a link, attaching files, capturing a note, then changing its type, title,
            visit and dates. Capture uses ⌘ or Ctrl + Enter. Undo affects captured rows; the current
            draft stays intact.
          </p>
          <p>
            All names and text are fixture or user data. Labels derive from the user title, first
            text line, filename or URL. Only a whole HTTP(S) URL is recognised; using it requires a
            click. Dates and visits are explicit selections. Files remain actual File objects in
            browser memory: no upload, extraction, remote writes or reload persistence. No LLM runs
            on card load.
          </p>
        </div>
      </details>
    </aside>
  );
}
