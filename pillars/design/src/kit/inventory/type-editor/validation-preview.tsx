import { validationItems } from '@/fixtures/inventory-type-catalogue';

import { cn } from '@pops/ui';

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

/** Full-catalogue draft validation summary with affected-item counts and samples. */
export function ValidationPreview() {
  return (
    <section className="space-y-4">
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
