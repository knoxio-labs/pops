import {
  ArrowUpRight,
  BedDouble,
  CarFront,
  CircleHelp,
  FileText,
  Lightbulb,
  MapPin,
  Route,
  Ticket,
  Users,
} from 'lucide-react';

import { Badge, cn } from '@pops/ui';

import type { JSX, ReactNode } from 'react';

import type { OverviewDocument, OverviewKind, OverviewLabels } from './types';

const noStatuses: (string | null)[] = [];
interface SourceCardProps {
  kind: OverviewKind;
  title: string;
  href?: string;
  onOpen?: () => void;
  purchased?: boolean;
  statuses?: (string | null)[];
  labels: OverviewLabels;
  when?: ReactNode;
  withWhom?: ReactNode;
  documents?: OverviewDocument[];
  children?: ReactNode;
}

const icons = {
  visit: MapPin,
  stay: BedDouble,
  event: Ticket,
  journey: Route,
  decision: CircleHelp,
  meeting: Users,
  capture: FileText,
  idea: Lightbulb,
  rental: CarFront,
};
const tones: Record<OverviewKind, string> = {
  visit: 'bg-muted text-foreground',
  stay: 'bg-trip-stay-soft text-trip-stay',
  event: 'bg-trip-experience-soft text-trip-experience',
  journey: 'bg-trip-transport-soft text-trip-transport',
  decision: 'bg-trip-sunken text-trip-muted',
  meeting: 'bg-trip-experience-soft text-trip-experience',
  capture: 'bg-muted text-muted-foreground',
  idea: 'bg-muted text-muted-foreground',
  rental: 'bg-trip-transport-soft text-trip-transport',
};

const purchaseTones: Record<OverviewKind, string> = {
  visit: 'border-l-trip-line',
  stay: 'border-l-trip-stay',
  event: 'border-l-trip-experience',
  journey: 'border-l-trip-transport',
  decision: 'border-l-trip-line',
  meeting: 'border-l-trip-experience',
  capture: 'border-l-trip-line',
  idea: 'border-l-trip-line',
  rental: 'border-l-trip-transport',
};
const purchaseBadges: Record<OverviewKind, string> = {
  visit: 'bg-trip-ink text-trip-canvas border-trip-ink',
  stay: 'bg-trip-stay text-trip-on-solid border-trip-stay',
  event: 'bg-trip-experience text-trip-on-solid border-trip-experience',
  journey: 'bg-trip-transport text-trip-on-solid border-trip-transport',
  decision: 'bg-trip-ink text-trip-canvas border-trip-ink',
  meeting: 'bg-trip-experience text-trip-on-solid border-trip-experience',
  capture: 'bg-trip-ink text-trip-canvas border-trip-ink',
  idea: 'bg-trip-ink text-trip-canvas border-trip-ink',
  rental: 'bg-trip-transport text-trip-on-solid border-trip-transport',
};

/** A source-backed workspace row; only an explicit purchase receives hard constraint styling. */
export function SourceCard(props: SourceCardProps): JSX.Element {
  const { title, href, onOpen, purchased = false, kind } = props;
  const className = cn(
    'group block min-h-14 w-full border-t border-trip-line bg-transparent px-4 py-2.5 text-left text-sm transition-colors',
    purchased && ['border-l-2', purchaseTones[kind]],
    'hover:bg-trip-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trip-transport'
  );
  const content = <CardContent {...props} />;
  let body: JSX.Element;
  if (onOpen)
    body = (
      <button type="button" onClick={onOpen} aria-label={title} className={className}>
        {content}
      </button>
    );
  else if (href)
    body = (
      <a href={href} aria-label={title} className={className}>
        {content}
      </a>
    );
  else body = <div className={className}>{content}</div>;
  return <article data-constraint={purchased ? 'hard' : 'soft'}>{body}</article>;
}

function CardContent({
  kind,
  title,
  href,
  statuses = noStatuses,
  labels,
  children,
  when,
  withWhom,
  documents,
}: SourceCardProps): JSX.Element {
  const Icon = icons[kind];
  return (
    <span className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-12 lg:items-start">
      <span className="min-w-0 break-words text-xs font-medium text-muted-foreground lg:col-span-2 lg:pt-1">
        {when ?? '—'}
      </span>
      <span className="flex min-w-0 items-start gap-3 lg:col-span-4">
        <span
          className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', tones[kind])}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words font-semibold leading-snug">{title}</span>
          {children && (
            <span className="mt-1 block break-words text-xs leading-relaxed text-muted-foreground">
              {children}
            </span>
          )}
        </span>
        {href && (
          <ArrowUpRight className="size-4 shrink-0 text-muted-foreground lg:hidden" aria-hidden />
        )}
      </span>
      <span className="flex flex-wrap gap-1.5 lg:col-span-2">
        {!statuses.some(Boolean) && <span className="text-xs text-muted-foreground">—</span>}
        {statuses
          .filter((value) => value !== null)
          .map((value) => (
            <Badge
              key={value}
              variant={value === 'Purchased' ? 'default' : 'outline'}
              className={value === 'Purchased' ? purchaseBadges[kind] : undefined}
            >
              {labels.status(value)}
            </Badge>
          ))}
      </span>
      <span className="min-w-0 break-words text-xs text-muted-foreground lg:col-span-2 lg:pt-1">
        {withWhom ?? '—'}
      </span>
      <SourceOriginals documents={documents} labels={labels} />
    </span>
  );
}

function SourceOriginals({
  documents,
  labels,
}: Pick<SourceCardProps, 'documents' | 'labels'>): JSX.Element {
  return (
    <span className="flex min-w-0 flex-wrap gap-1.5 lg:col-span-2">
      {!documents?.length
        ? '—'
        : documents.map((document) => (
            <span
              key={document.documentId}
              className="inline-flex min-h-7 max-w-full items-center gap-1 rounded-md border border-border bg-background px-2 text-xs text-muted-foreground"
            >
              <FileText className="size-3 shrink-0" aria-hidden />
              <span className="break-words">{labels.source('document', document.documentId)}</span>
            </span>
          ))}
    </span>
  );
}
