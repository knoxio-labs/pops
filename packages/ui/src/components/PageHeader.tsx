/**
 * PageHeader — shared page header with back button, breadcrumbs, and title.
 *
 * For drill-down pages: shows ArrowLeft back button + breadcrumb trail + page title.
 * For top-level pages: shows just the page title (omit backHref and breadcrumbs).
 *
 * Router-agnostic: pass `renderLink` to use your router's Link component
 * for client-side navigation. Defaults to `<a>`.
 */
import { type ReactNode, type ComponentType } from "react";
import { ArrowLeft } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from "../primitives/breadcrumb";
import { cn } from "../lib/utils";

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  /** Page title displayed as heading */
  title: ReactNode;
  /** URL of the logical parent page — shows back button when provided */
  backHref?: string;
  /** Breadcrumb segments — last segment is the current page (not clickable) */
  breadcrumbs?: BreadcrumbSegment[];
  /** Optional actions rendered to the right of the title */
  actions?: ReactNode;
  /** Custom link component for client-side routing (e.g. react-router Link) */
  renderLink?: ComponentType<{ to: string; className?: string; children: ReactNode }>;
  className?: string;
}

function DefaultLink({
  to,
  className,
  children,
}: {
  to: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a href={to} className={className}>
      {children}
    </a>
  );
}

/**
 * Collapse middle breadcrumb segments on mobile.
 * Always shows first and last; middle segments get an ellipsis on small screens.
 */
function BreadcrumbItems({
  segments,
  LinkComponent,
}: {
  segments: BreadcrumbSegment[];
  LinkComponent: ComponentType<{ to: string; className?: string; children: ReactNode }>;
}) {
  if (segments.length === 0) return null;

  return segments.map((segment, index) => {
    const isLast = index === segments.length - 1;
    const isFirst = index === 0;
    const isMiddle = !isFirst && !isLast;

    // Middle segments: hidden on mobile, replaced by ellipsis
    if (isMiddle && segments.length > 2) {
      return (
        <BreadcrumbItem
          key={`${segment.label}-${index}`}
          className="hidden sm:inline-flex"
        >
          {segment.href ? (
            <BreadcrumbLink asChild>
              <LinkComponent
                to={segment.href}
                className="text-muted-foreground hover:text-foreground"
              >
                {segment.label}
              </LinkComponent>
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage className="text-foreground font-medium">
              {segment.label}
            </BreadcrumbPage>
          )}
          <BreadcrumbSeparator />
        </BreadcrumbItem>
      );
    }

    // Ellipsis marker — shown only on mobile when there are middle segments
    if (isFirst && segments.length > 2) {
      return (
        <BreadcrumbItem key={`${segment.label}-${index}`}>
          {segment.href ? (
            <BreadcrumbLink asChild>
              <LinkComponent
                to={segment.href}
                className="text-muted-foreground hover:text-foreground"
              >
                {segment.label}
              </LinkComponent>
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage className="text-foreground font-medium">
              {segment.label}
            </BreadcrumbPage>
          )}
          <BreadcrumbSeparator />
          {/* Ellipsis for collapsed middle segments on mobile */}
          <BreadcrumbItem className="sm:hidden">
            <BreadcrumbEllipsis />
            <BreadcrumbSeparator />
          </BreadcrumbItem>
        </BreadcrumbItem>
      );
    }

    // Last segment — current page, not clickable
    if (isLast) {
      return (
        <BreadcrumbItem key={`${segment.label}-${index}`}>
          <BreadcrumbPage className="text-foreground font-medium">
            {segment.label}
          </BreadcrumbPage>
        </BreadcrumbItem>
      );
    }

    // First segment when no middle segments exist
    return (
      <BreadcrumbItem key={`${segment.label}-${index}`}>
        {segment.href ? (
          <BreadcrumbLink asChild>
            <LinkComponent
              to={segment.href}
              className="text-muted-foreground hover:text-foreground"
            >
              {segment.label}
            </LinkComponent>
          </BreadcrumbLink>
        ) : (
          <BreadcrumbPage className="text-foreground font-medium">
            {segment.label}
          </BreadcrumbPage>
        )}
        <BreadcrumbSeparator />
      </BreadcrumbItem>
    );
  });
}

export function PageHeader({
  title,
  backHref,
  breadcrumbs,
  actions,
  renderLink: LinkComponent = DefaultLink,
  className,
}: PageHeaderProps) {
  const hasBreadcrumbs = breadcrumbs && breadcrumbs.length > 0;
  const isTopLevel = !backHref && !hasBreadcrumbs;

  if (isTopLevel) {
    return (
      <header className={cn("space-y-1", className)}>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </header>
    );
  }

  return (
    <header className={cn("space-y-2", className)}>
      <div className="flex items-center gap-3">
        {backHref && (
          <LinkComponent
            to={backHref}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">Go back</span>
          </LinkComponent>
        )}
        {hasBreadcrumbs && (
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItems
                segments={breadcrumbs}
                LinkComponent={LinkComponent}
              />
            </BreadcrumbList>
          </Breadcrumb>
        )}
      </div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
