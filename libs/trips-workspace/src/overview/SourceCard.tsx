import { ArrowUpRight, BedDouble, CircleHelp, MapPin, Route, Ticket } from 'lucide-react';

import { Badge, cn } from '@pops/ui';

import type { JSX, ReactNode } from 'react';

import type { OverviewKind, OverviewLabels } from './types';

const noStatuses: (string | null)[] = [];
interface SourceCardProps {
  kind: OverviewKind;
  title: string;
  href?: string;
  purchased?: boolean;
  statuses?: (string | null)[];
  labels: OverviewLabels;
  children?: ReactNode;
}

const icons = {
  visit: MapPin,
  stay: BedDouble,
  event: Ticket,
  journey: Route,
  decision: CircleHelp,
};

/** Compact source fact card; only explicit purchase evidence receives a solid constraint border. */
export function SourceCard({
  kind,
  title,
  href,
  purchased = false,
  statuses = noStatuses,
  labels,
  children,
}: SourceCardProps): JSX.Element {
  const content = (
    <CardContent kind={kind} title={title} href={href} statuses={statuses} labels={labels}>
      {children}
    </CardContent>
  );
  const className = cn(
    'block min-h-11 space-y-2 rounded-lg border p-3 text-sm',
    purchased ? 'border-solid border-l-4 border-l-app-accent' : 'border-dashed border-border'
  );
  return (
    <article data-constraint={purchased ? 'hard' : 'soft'}>
      {href ? (
        <a
          href={href}
          className={cn(
            className,
            'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
        >
          {content}
        </a>
      ) : (
        <div className={className}>{content}</div>
      )}
    </article>
  );
}

function CardContent({
  kind,
  title,
  href,
  statuses = noStatuses,
  labels,
  children,
}: SourceCardProps): JSX.Element {
  const Icon = icons[kind];
  return (
    <>
      <span className="flex min-w-0 items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0 text-app-accent" aria-hidden />
        <span className="min-w-0 flex-1 break-words font-medium">{title}</span>
        {href && (
          <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </span>
      {children && (
        <span className="block space-y-1 break-words text-xs text-muted-foreground">
          {children}
        </span>
      )}
      {statuses.some(Boolean) && (
        <span className="flex flex-wrap gap-1.5">
          {statuses
            .filter((value) => value !== null)
            .map((value) => (
              <Badge key={value} variant={value === 'Purchased' ? 'default' : 'outline'}>
                {labels.status(value)}
              </Badge>
            ))}
        </span>
      )}
    </>
  );
}
