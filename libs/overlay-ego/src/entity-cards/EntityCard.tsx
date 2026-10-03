import { resolveUri, useSearchResultNavigation } from '@pops/navigation';
import { cn } from '@pops/ui';

import { variantFor } from './entity-card-variants';

import type { EntityPart } from '../chat-hooks/message-parts';

/** Renders an entity part as a typed card, navigating only when its URI resolves. */
export function EntityCard({ part }: { part: EntityPart }) {
  const { navigateTo } = useSearchResultNavigation();
  const variant = variantFor(part.uri);
  const Icon = variant.icon;
  const canNavigate = resolveUri(part.uri) !== null;
  const content = (
    <>
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{variant.label}</span>
        <span className="truncate text-sm font-medium text-foreground">{part.title}</span>
        {part.subtitle !== undefined && (
          <span className="text-sm text-muted-foreground">{part.subtitle}</span>
        )}
      </span>
    </>
  );
  const className = cn(
    'flex min-h-11 w-full items-start gap-3 rounded-lg border border-border/50 bg-muted/50 p-3 text-left',
    canNavigate &&
      'cursor-pointer transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  );

  if (!canNavigate) {
    return (
      <div className={className} data-slot="entity-card">
        {content}
      </div>
    );
  }

  return (
    <button
      aria-label={`${variant.label}: ${part.title}`}
      className={className}
      data-slot="entity-card"
      onClick={() => navigateTo(part.uri)}
      type="button"
    >
      {content}
    </button>
  );
}
