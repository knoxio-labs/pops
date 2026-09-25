/**
 * The page shell the location screens and moving day share: the POPS page
 * header with the amber tile, an optional state banner, and a body that
 * fills exactly what is left of the viewport. The page itself never
 * scrolls; the lists inside the body do.
 */
import { House, Inbox, MapPin, Sofa, SquareDashed } from 'lucide-react';

import { PageHeader, Toaster, cn } from '@pops/ui';

import { UndoToast } from '../foundation';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { BreadcrumbSegment } from '@pops/ui';

import type { LocationKind, UndoToastProps } from '../foundation';

/** One symbol per kind of place, so a room and a drawer do not read alike in the tree. */
export const PLACE_ICONS: Readonly<Record<LocationKind, LucideIcon>> = {
  property: House,
  room: MapPin,
  furniture: Sofa,
  storage: Inbox,
  area: SquareDashed,
};

/** The amber tile a page title carries. */
export function PageTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-app-accent/15">
      <Icon className="size-5 text-app-accent" aria-hidden />
    </span>
  );
}

/** A count after a tab's label, quieter than the label. */
export function TabCount({ n }: { n: number }) {
  return <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{n}</span>;
}

/** Props for {@link FitPage}. */
export interface FitPageProps {
  title: ReactNode;
  icon: LucideIcon;
  description?: ReactNode;
  breadcrumbs?: BreadcrumbSegment[];
  actions?: ReactNode;
  /** A state banner between the header and the body. */
  banner?: ReactNode;
  /** An undo toast drawn in place, for review states that show one. */
  toast?: UndoToastProps;
  children: ReactNode;
  className?: string;
}

/** A page that fits the viewport under the POPS chrome. */
export function FitPage(props: FitPageProps) {
  return (
    <div
      className={cn(
        'flex h-[calc(100vh-5.5rem)] min-h-120 flex-col gap-4 md:h-[calc(100vh-7rem)] lg:h-[calc(100vh-8rem)]',
        props.className
      )}
    >
      <PageHeader
        title={props.title}
        icon={<PageTile icon={props.icon} />}
        description={props.description}
        breadcrumbs={props.breadcrumbs}
        actions={props.actions}
      />
      {props.banner}
      <div className="flex min-h-0 flex-1 flex-col">{props.children}</div>
      <Toaster />
      {props.toast ? (
        <div className="pointer-events-none fixed right-6 bottom-6 z-40 [&>*]:pointer-events-auto">
          <UndoToast {...props.toast} />
        </div>
      ) : null}
    </div>
  );
}
