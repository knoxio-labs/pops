import { Fragment, type ComponentType, type ReactNode } from 'react';

import {
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../primitives/breadcrumb';

import type { BreadcrumbSegment } from './PageHeader';

function SegmentLink({
  segment,
  LinkComponent,
}: {
  segment: BreadcrumbSegment;
  LinkComponent: ComponentType<{ to: string; className?: string; children: ReactNode }>;
}) {
  if (segment.href) {
    return (
      <BreadcrumbLink asChild>
        <LinkComponent to={segment.href} className="text-muted-foreground hover:text-foreground">
          {segment.label}
        </LinkComponent>
      </BreadcrumbLink>
    );
  }
  return <BreadcrumbPage className="text-foreground font-medium">{segment.label}</BreadcrumbPage>;
}

/** Preserve endpoint breadcrumbs and collapse middle segments on small screens. */
export function BreadcrumbItems({
  segments,
  LinkComponent,
}: {
  segments: BreadcrumbSegment[];
  LinkComponent: ComponentType<{ to: string; className?: string; children: ReactNode }>;
}) {
  if (segments.length === 0) return null;

  const hasMiddleSegments = segments.length > 2;

  return segments.map((segment, index) => {
    const isLast = index === segments.length - 1;
    const isFirst = index === 0;
    const isMiddle = !isFirst && !isLast;

    if (isLast) {
      return (
        <BreadcrumbItem key={`${segment.label}-${index}`}>
          <BreadcrumbPage className="text-foreground font-medium">{segment.label}</BreadcrumbPage>
        </BreadcrumbItem>
      );
    }

    if (isMiddle && hasMiddleSegments) {
      return (
        <Fragment key={`${segment.label}-${index}`}>
          <BreadcrumbItem className="hidden sm:inline-flex">
            <SegmentLink segment={segment} LinkComponent={LinkComponent} />
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden sm:flex" />
        </Fragment>
      );
    }

    if (isFirst && hasMiddleSegments) {
      return (
        <Fragment key={`${segment.label}-${index}`}>
          <BreadcrumbItem>
            <SegmentLink segment={segment} LinkComponent={LinkComponent} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem className="sm:hidden">
            <BreadcrumbEllipsis />
          </BreadcrumbItem>
          <BreadcrumbSeparator className="sm:hidden" />
        </Fragment>
      );
    }

    return (
      <Fragment key={`${segment.label}-${index}`}>
        <BreadcrumbItem>
          <SegmentLink segment={segment} LinkComponent={LinkComponent} />
        </BreadcrumbItem>
        <BreadcrumbSeparator />
      </Fragment>
    );
  });
}
