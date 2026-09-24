import { validationItems } from '@/fixtures/inventory-type-catalogue';

import { Badge, cn } from '@pops/ui';

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'destructive' }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn('mt-1 text-2xl font-semibold', tone === 'destructive' && 'text-destructive')}
      >
        {value}
      </p>
    </div>
  );
}

function Placeholder() {
  return (
    <section aria-label="Dry-run validation" className="space-y-2 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">Dry-run validation</h3>
        <Badge variant="outline">Not yet previewed</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Edit a type or field to run a dry-run preview before publishing.
      </p>
    </section>
  );
}

function Results() {
  return (
    <section aria-label="Dry-run validation" className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">Dry-run validation</h3>
        <Badge variant="outline">Compatible</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Affected items" value="184" />
        <Metric label="Valid" value="183" />
        <Metric label="Needs migration" value="1" tone="destructive" />
      </div>
      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-3 bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
          <span className="col-span-2">Sample item</span>
          <span>Draft result</span>
        </div>
        {validationItems.map((item) => (
          <div
            key={item.id}
            className="grid min-h-11 grid-cols-3 items-center border-t px-3 py-2 text-sm"
          >
            <span className="col-span-2 font-medium">{item.name}</span>
            <span
              className={cn(item.result === 'Valid' ? 'text-muted-foreground' : 'text-destructive')}
            >
              {item.result}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Preview evaluates the complete draft against all 184 affected items before publication.
      </p>
    </section>
  );
}

/**
 * Dry-run validation summary shown in the publish panel, matching where the
 * web editor surfaces compatibility: never as a separate tab.
 */
export function DryRunValidation({ ready }: { ready: boolean }) {
  return ready ? <Results /> : <Placeholder />;
}
