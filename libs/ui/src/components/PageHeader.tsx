/**
 * PageHeader — shared page header with back button, breadcrumbs, and title.
 *
 * For drill-down pages: shows ArrowLeft back button + breadcrumb trail + page title.
 * For top-level pages: shows just the page title (omit backHref and breadcrumbs).
 *
 * Router-agnostic: pass `renderLink` to use your router's Link component
 * for client-side navigation. Defaults to `<a>`.
 */
import { ArrowLeft } from 'lucide-react';
import { type ComponentType, type ReactNode } from 'react';

import { cn } from '../lib/utils';
import { Breadcrumb, BreadcrumbList } from '../primitives/breadcrumb';
import { BreadcrumbItems } from './PageHeaderBreadcrumbs';

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  /** Page title displayed as heading */
  title: ReactNode;
  /** Typography on the h1 itself; when supplied, replaces the default responsive title sizing. */
  titleClassName?: string;
  /** Optional icon rendered before the title */
  icon?: ReactNode;
  /** Optional description shown below the title */
  description?: ReactNode;
  /** URL of the logical parent page — shows back button when provided */
  backHref?: string;
  /** Breadcrumb segments — last segment is the current page (not clickable) */
  breadcrumbs?: BreadcrumbSegment[];
  /** Actions share the title row when space permits and wrap below otherwise. */
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

function HeaderTitle({
  icon,
  title,
  titleClassName,
  description,
  actions,
}: {
  icon?: ReactNode;
  title: ReactNode;
  titleClassName?: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0 flex-1 basis-64">
        <div className="flex items-center gap-3">
          {icon}
          <h1 className={cn('font-bold tracking-tight', titleClassName ?? 'text-2xl md:text-3xl')}>
            {title}
          </h1>
        </div>
        {description && <p className="text-muted-foreground text-sm mt-1">{description}</p>}
      </div>
      {actions && (
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

export function PageHeader({
  title,
  titleClassName,
  icon,
  description,
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
      <header className={cn('space-y-1', className)}>
        <HeaderTitle
          icon={icon}
          title={title}
          titleClassName={titleClassName}
          description={description}
          actions={actions}
        />
      </header>
    );
  }

  return (
    <header className={cn('space-y-2', className)}>
      <div className="flex items-center gap-3">
        {backHref && (
          <LinkComponent
            to={backHref}
            className="min-w-11 min-h-11 flex items-center justify-center hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">Go back</span>
          </LinkComponent>
        )}
        {hasBreadcrumbs && (
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItems segments={breadcrumbs} LinkComponent={LinkComponent} />
            </BreadcrumbList>
          </Breadcrumb>
        )}
      </div>
      <HeaderTitle
        icon={icon}
        title={title}
        titleClassName={titleClassName}
        description={description}
        actions={actions}
      />
    </header>
  );
}
