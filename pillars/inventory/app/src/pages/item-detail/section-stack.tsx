import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { ButtonPrimitive, cn } from '@pops/ui';

import { INVENTORY_ICONS } from '../../foundation/model/icons.js';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode, ReactElement } from 'react';

import type { DetailSectionId } from './detail-model.js';

/** A folded item-detail section with its summary and rendered body. */
export interface SectionSpec {
  id: DetailSectionId;
  title: string;
  icon: LucideIcon;
  count: number | null;
  summary: string;
  flagged: boolean;
  body: ReactNode;
}

function Count({ count }: { count: number | null }): ReactElement | null {
  if (count === null || count === 0) return null;
  return <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>;
}

function SectionRow({
  spec,
  open,
  onToggle,
}: {
  spec: SectionSpec;
  open: boolean;
  onToggle: () => void;
}): ReactElement {
  const Icon = spec.icon;
  const Flag = INVENTORY_ICONS.needsAttention;
  return (
    <ButtonPrimitive
      variant="ghost"
      aria-expanded={open}
      aria-controls={`section-${spec.id}`}
      onClick={onToggle}
      className="h-auto min-h-11 w-full shrink-0 justify-start gap-3 rounded-none px-4 py-1.5 font-normal"
    >
      <ChevronRight
        className={cn(
          'size-4 shrink-0 text-muted-foreground transition-transform',
          open && 'rotate-90'
        )}
        aria-hidden
      />
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col @md:flex-row @md:items-center @md:gap-3">
        <span className="flex shrink-0 items-center gap-2 @md:w-36">
          <span className="text-left text-sm font-medium">{spec.title}</span>
          <Count count={spec.count} />
        </span>
        {open ? null : (
          <span className="min-w-0 truncate text-left text-xs text-muted-foreground @md:text-sm">
            {spec.summary}
          </span>
        )}
      </span>
      {spec.flagged ? (
        <Flag className="size-4 shrink-0 text-warning" aria-label="Needs a look" />
      ) : null}
    </ButtonPrimitive>
  );
}

/** Props for the folded detail-section stack. */
export interface SectionStackProps {
  sections: readonly SectionSpec[];
  initialOpen?: DetailSectionId | null;
  className?: string;
}

/** Renders one open detail section at a time with a scrolling section body. */
export function SectionStack({
  sections,
  initialOpen = null,
  className,
}: SectionStackProps): ReactElement {
  const [openId, setOpenId] = useState<DetailSectionId | null>(initialOpen);
  return (
    <div
      className={cn(
        '@container flex min-h-0 flex-col divide-y overflow-hidden rounded-xl border bg-card',
        openId !== null && 'flex-1',
        className
      )}
    >
      {sections.map((spec) => {
        const open = spec.id === openId;
        return (
          <section
            key={spec.id}
            aria-label={spec.title}
            className={cn('flex flex-col', open && 'min-h-0 flex-1')}
          >
            <SectionRow spec={spec} open={open} onToggle={() => setOpenId(open ? null : spec.id)} />
            {open ? (
              <div
                id={`section-${spec.id}`}
                className="@container min-h-0 flex-1 overflow-y-auto px-4 pb-3"
              >
                {spec.body}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
