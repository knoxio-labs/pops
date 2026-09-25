/**
 * Banners only the Items page raises, in the shared banner's shape: a type
 * arrived that untyped items look like (iOS #5), and two rows that look like
 * one thing filed twice. Both say what is true and offer one next step; the
 * type one also lets it wait.
 */
import { CopySlash } from 'lucide-react';

import { Button, cn } from '@pops/ui';

import { INVENTORY_ICONS } from '../foundation';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

function Frame({
  icon: Icon,
  tone,
  title,
  detail,
  children,
}: {
  icon: LucideIcon;
  tone: 'accent' | 'warning';
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3 py-2',
        tone === 'accent'
          ? 'border-app-accent/40 bg-app-accent/10'
          : 'border-warning/40 bg-warning/10'
      )}
    >
      <Icon
        className={cn('size-4 shrink-0', tone === 'accent' ? 'text-app-accent' : 'text-warning')}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <span className="flex shrink-0 items-center gap-1">{children}</span>
    </div>
  );
}

/** A newly published type matches untyped items. */
export function TypeArrivedBanner({
  typeLabel,
  matches,
  publishedBy,
}: {
  typeLabel: string;
  matches: number;
  publishedBy: string;
}) {
  return (
    <Frame
      icon={INVENTORY_ICONS.type}
      tone="accent"
      title={`${String(matches)} untyped items look like ${typeLabel}`}
      detail={`${typeLabel} was published from ${publishedBy}. Review them before anything changes.`}
    >
      <Button size="sm" variant="ghost">
        Not now
      </Button>
      <Button size="sm" variant="outline" className="bg-background">
        Review {matches}
      </Button>
    </Frame>
  );
}

/** Two rows share a name and a place. Merging is undecided (ADR-001), so this only compares. */
export function DuplicatesBanner({ name, place }: { name: string; place: string }) {
  return (
    <Frame
      icon={CopySlash}
      tone="warning"
      title={`Two items called ${name} sit on ${place}`}
      detail="One has a code and one does not. Open both to decide which to keep."
    >
      <Button size="sm" variant="ghost">
        Dismiss
      </Button>
      <Button size="sm" variant="outline" className="bg-background">
        Compare both
      </Button>
    </Frame>
  );
}
