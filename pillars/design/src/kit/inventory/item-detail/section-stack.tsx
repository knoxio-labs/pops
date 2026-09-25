/**
 * Sections as folded rows, one open at a time (the stacked layout, and the
 * container's side pane). A folded row still says what is inside in one
 * line, so most questions are answered without opening anything, and the
 * open section's body is the only thing that scrolls.
 */
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { ButtonPrimitive, cn } from '@pops/ui';

import { INVENTORY_ICONS } from '../foundation';

import type { DetailSectionId } from './detail-model';
import type { SectionSpec } from './sections';

function Count({ count }: { count: number | null }) {
  if (count === null || count === 0) return null;
  return <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>;
}

function Row({ spec, open, onToggle }: { spec: SectionSpec; open: boolean; onToggle: () => void }) {
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

/** Props for {@link SectionStack}. */
export interface SectionStackProps {
  sections: readonly SectionSpec[];
  initialOpen?: DetailSectionId | null;
  className?: string;
}

/** The folded-rows stack. It grows to fill the space only while a section is open. */
export function SectionStack({ sections, initialOpen = null, className }: SectionStackProps) {
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
            <Row spec={spec} open={open} onToggle={() => setOpenId(open ? null : spec.id)} />
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
