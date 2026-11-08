import { Badge, Button } from '@pops/ui';

/** Prototype questions and data provenance live outside the product form. */
export function SettingsReview({ layout }: { layout: 'quick' | 'full' }) {
  return (
    <aside className="space-y-2 border-b bg-muted/30 px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">D06 · Review</Badge>
        <span className="text-xs text-muted-foreground">
          Fictional data · changes reset on reload
        </span>
        {(['quick', 'full'] as const).map((id) => (
          <Button key={id} asChild variant={id === layout ? 'secondary' : 'ghost'}>
            <a target="_top" href={`/design/x/trip-settings/${id}/s/trips/settings`}>
              {id === 'quick' ? 'Quick start' : 'All fields'}
            </a>
          </Button>
        ))}
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm">Proposals and questions</summary>
        <div className="space-y-2 pb-2 text-sm">
          <p>
            Quick start leads with destination and creation; other settings stay under More options.
            All fields exposes the complete form before creation. Both open the same settings after
            creating.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Start with a destination or see all settings immediately?</li>
            <li>Are the generated name, shared tag and optional parent trip clear?</li>
          </ol>
          <p>
            Try a completely blank trip, a custom name, open-ended or reversed dates, a different
            shared tag, a nested trip, unlinking and undo. Parent and tag selection never copy
            dates, bookings or membership. Creating or saving changes a local snapshot only.
          </p>
          <p>
            Name, destination and notes are user text. Dates and catalogue identities are explicit
            fields. The displayed title formats destination and a valid start year unless a custom
            name is present. Findings and eligible parents are deterministic. Tags and trips are
            separate reusable records; removing an association preserves the catalogue. No network
            writes, geocoding, inferred dates or LLM calls.
          </p>
        </div>
      </details>
    </aside>
  );
}
