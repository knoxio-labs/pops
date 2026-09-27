import { Search } from 'lucide-react';

import { Button, EmptyState, Skeleton, TextInput, cn } from '@pops/ui';

import type { LucideIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

/** Renders the controlled filter input shared by secondary-page lists. */
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
}): ReactElement {
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

/** Renders the column captions for a secondary-page list. */
export function ColumnHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
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

/** Renders secondary-page list rows while data is loading. */
export function SkeletonRows({ rows = 8 }: { rows?: number }): ReactElement {
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

/** Renders the empty state for a list that has no records yet. */
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
}): ReactElement {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState icon={icon} title={title} description={description} action={action} size="md" />
    </div>
  );
}

/** Renders the standard empty state for filters that match no records. */
export function NoMatchBody({
  what,
  onClear,
}: {
  what: string;
  onClear?: () => void;
}): ReactElement {
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
