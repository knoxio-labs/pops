import { CircleAlert, FileUp, ListPlus, Plus, SearchX } from 'lucide-react';

import { Button, EmptyState, Skeleton, cn } from '@pops/ui';

import { OFFLINE_TITLE, StateBanner } from '../feedback/state-banner.js';

import type { LucideIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

/** The scroll container shared by every inventory list body state. */
export function ListBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return <div className={cn('min-h-0 flex-1 overflow-auto', className)}>{children}</div>;
}

const SKELETON_ROWS = Array.from({ length: 14 }, (_, index) => `row-${String(index)}`);

/** Renders fourteen table-shaped placeholders while the first page loads. */
export function ListSkeleton({ label }: { label: string }): ReactElement {
  return (
    <ListBody>
      <div aria-busy aria-label={label} className="divide-y divide-border/60">
        <div className="h-9 border-b" />
        {SKELETON_ROWS.map((row, index) => (
          <div key={row} className="flex h-9 items-center gap-3 pr-2 pl-3.5">
            <Skeleton className="size-4 rounded" />
            <Skeleton className="size-7 rounded-md" />
            <Skeleton className={index % 3 === 0 ? 'h-3 w-56' : 'h-3 w-40'} />
            <span className="flex-1" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    </ListBody>
  );
}

function Centered({
  icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action: ReactNode;
}): ReactElement {
  return (
    <ListBody className="flex items-center justify-center">
      <EmptyState icon={icon} title={title} description={description} action={action} size="md" />
    </ListBody>
  );
}

/** Renders the three entry points when the inventory has no rows at all. */
export function EmptyInventory({
  noun,
  onNavigate,
  offline = false,
}: {
  noun: string;
  onNavigate: (path: string) => void;
  offline?: boolean;
}): ReactElement {
  return (
    <Centered
      icon={ListPlus}
      title={`No ${noun} yet`}
      description="Add one, type or paste many at once, or import a spreadsheet."
      action={
        <span className="flex flex-wrap justify-center gap-2">
          <Button
            disabled={offline}
            onClick={() => onNavigate('/inventory/items/new')}
            prefix={<Plus className="size-4" aria-hidden />}
          >
            New item
          </Button>
          <Button
            variant="outline"
            disabled={offline}
            onClick={() => onNavigate('/inventory/items/bulk-new')}
            prefix={<ListPlus className="size-4" aria-hidden />}
          >
            Bulk entry
          </Button>
          <Button
            variant="outline"
            disabled={offline}
            onClick={() => onNavigate('/inventory/import')}
            prefix={<FileUp className="size-4" aria-hidden />}
          >
            Import CSV
          </Button>
        </span>
      }
    />
  );
}

/** Renders the empty result state for a narrowed server query. */
export function EmptyFiltered({
  noun,
  onClear,
}: {
  noun: string;
  onClear: () => void;
}): ReactElement {
  return (
    <Centered
      icon={SearchX}
      title={`No ${noun} match these filters`}
      description="Retired, discarded, lost and destroyed items only show with Include inactive."
      action={
        <Button variant="outline" onClick={onClear}>
          Clear filters
        </Button>
      }
    />
  );
}

/** Renders the failed list state and retries the server query. */
export function ListError({ noun, onRetry }: { noun: string; onRetry: () => void }): ReactElement {
  return (
    <Centered
      icon={CircleAlert}
      title={`${noun.charAt(0).toUpperCase()}${noun.slice(1)} did not load`}
      description="The inventory service did not answer. Nothing was changed."
      action={
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
      }
    />
  );
}

/** Renders the shared offline state banner for list pages. */
export function OfflineBanner(): ReactElement {
  return (
    <StateBanner
      kind="offline"
      title={OFFLINE_TITLE}
      detail="Changes are off until the connection is back."
    />
  );
}
