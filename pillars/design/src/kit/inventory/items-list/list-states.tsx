/**
 * What a list body shows when it has no rows to show: loading (one skeleton
 * in the table's shape), empty (with the action that fills it), filtered to
 * nothing (with Clear filters), and failed (what failed, and Retry).
 */
import { CircleAlert, FileUp, ListPlus, Plus, SearchX } from 'lucide-react';

import { Button, EmptyState, Skeleton } from '@pops/ui';

import { ListBody } from './list-page';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

const SKELETON_ROWS = Array.from({ length: 14 }, (_, index) => `row-${String(index)}`);

/** The table's shape, loading. */
export function ListSkeleton({ label }: { label: string }) {
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
}) {
  return (
    <ListBody className="flex items-center justify-center">
      <EmptyState icon={icon} title={title} description={description} action={action} size="md" />
    </ListBody>
  );
}

/** Nothing tracked yet: the three ways in. */
export function EmptyInventory({ noun = 'items' }: { noun?: string }) {
  return (
    <Centered
      icon={ListPlus}
      title={`No ${noun} yet`}
      description="Add one, type or paste many at once, or import a spreadsheet."
      action={
        <span className="flex flex-wrap justify-center gap-2">
          <Button prefix={<Plus className="size-4" aria-hidden />}>New item</Button>
          <Button variant="outline" prefix={<ListPlus className="size-4" aria-hidden />}>
            Bulk entry
          </Button>
          <Button variant="outline" prefix={<FileUp className="size-4" aria-hidden />}>
            Import CSV
          </Button>
        </span>
      }
    />
  );
}

/** The filters leave nothing. */
export function EmptyFiltered({
  noun = 'items',
  onClear,
}: {
  noun?: string;
  onClear?: () => void;
}) {
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

/** The list did not load. */
export function ListError({ noun = 'items' }: { noun?: string }) {
  return (
    <Centered
      icon={CircleAlert}
      title={`${noun.charAt(0).toUpperCase()}${noun.slice(1)} did not load`}
      description="The inventory service did not answer. Nothing was changed."
      action={<Button variant="outline">Retry</Button>}
    />
  );
}
