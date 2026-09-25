/**
 * The edit form before its item arrives: one skeleton in the page's own
 * shape, and the one error an edit can open on.
 */
import { Card, CardContent, PageHeader, Skeleton } from '@pops/ui';

import { StateBanner } from '../shared/state-banner';

const LEFT = ['name', 'type', 'code', 'place', 'note'];
const RIGHT = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9'];

/** Loading an item to edit. */
export function FormSkeleton() {
  return (
    <div
      className="flex flex-col gap-4 lg:h-[calc(100vh-8rem)]"
      aria-busy
      aria-label="Loading the item"
    >
      <PageHeader
        title={<Skeleton className="h-8 w-56" />}
        description={<Skeleton className="mt-1 h-4 w-72" />}
      />
      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card className="py-0">
          <CardContent className="space-y-5 p-5">
            {LEFT.map((key) => (
              <div key={key} className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="divide-y p-5 py-2">
            {RIGHT.map((key) => (
              <div key={key} className="grid grid-cols-[9rem_1fr] gap-4 py-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** The item could not be loaded for editing. */
export function FormLoadError({ name }: { name: string }) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={`Edit ${name}`} />
      <StateBanner
        kind="error"
        title={`Could not load ${name}.`}
        detail="The inventory service did not answer. Nothing was changed."
        actionLabel="Retry"
      />
    </div>
  );
}
