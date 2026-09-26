/**
 * Small pieces the secondary pages' lists share: the filter field, the
 * column header row, skeleton rows in the list's own shape, and the empty
 * and no-match bodies, each with the one action that changes the outcome.
 */
import { Search } from 'lucide-react';

import { Button, EmptyState, Skeleton, TextInput, cn } from '@pops/ui';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** The list filter box. */
export function FilterField({
  value,
  placeholder,
  onChange,
  className,
}: {
  value: string;
  placeholder: string;
  onChange?: (value: string) => void;
  className?: string;
}) {
  return (
    <TextInput
      value={value}
      placeholder={placeholder}
      aria-label={placeholder}
      prefix={<Search className="size-4 text-muted-foreground" aria-hidden />}
      clearable
      onClear={() => onChange?.('')}
      onChange={(event) => onChange?.(event.target.value)}
      containerClassName={cn('w-72', className)}
    />
  );
}

/** A list's column captions; widths come from the caller's grid template. */
export function ColumnHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="row"
      className={cn(
        'grid h-8 shrink-0 items-center gap-3 border-b bg-muted/40 px-3 text-2xs font-medium tracking-label text-muted-foreground uppercase',
        className
      )}
    >
      {children}
    </div>
  );
}

const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

/** Skeleton rows at the list's row height. */
export function SkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="divide-y divide-border/60">
      {SKELETON_ROWS.slice(0, rows).map((key) => (
        <div key={key} className="flex h-10 items-center gap-3 px-3">
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="ml-auto h-3.5 w-32" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}

/** A list with nothing in it yet, and the one action that fills it. */
export function EmptyBody({
  icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState icon={icon} title={title} description={description} action={action} size="md" />
    </div>
  );
}

/** A filter that matched nothing, with Clear filters. */
export function NoMatchBody({ what, onClear }: { what: string; onClear?: () => void }) {
  return (
    <EmptyBody
      icon={Search}
      title={`No ${what} match these filters`}
      description="Clear them to see everything again."
      action={
        <Button variant="outline" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      }
    />
  );
}
