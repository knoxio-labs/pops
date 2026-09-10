import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';

import { Button } from '@pops/ui';

import { unwrap } from '../../food-api-helpers.js';
import { planWeekView } from '../../food-api/index.js';
import { PlanEntryEditForm } from './PlanEntryEditForm.js';
import { useIsMobile } from './useIsMobile.js';

/**
 * Plan entry edit sheet: a right-side drawer on desktop, a bottom-sheet at
 * narrow viewports (via `useIsMobile`). Surfaces servings, notes, a "Mark
 * cooked" CTA that links into the cook flow
 * (pillars/food/docs/prds/cook-event-recording), and delete. When the entry
 * has a non-null `recipeRunId` the form is read-only and shows "Cooked on".
 *
 * Spec: pillars/food/docs/prds/planning-page
 */
import type { ReactElement } from 'react';

import type { WirePlanEntryRow } from './plan-wire-types.js';

export interface PlanEntryEditSheetProps {
  entryId: number | null;
  weekStart: string;
  isOpen: boolean;
  onClose: () => void;
}

export function PlanEntryEditSheet(props: PlanEntryEditSheetProps): ReactElement | null {
  const { entryId, weekStart, isOpen, onClose } = props;
  const isMobile = useIsMobile();
  const weekQuery = useQuery({
    queryKey: ['food', 'plan', 'weekView', { weekStart }],
    queryFn: async () => unwrap(await planWeekView({ query: { weekStart } })),
    enabled: isOpen,
  });
  const entry = (weekQuery.data?.entries ?? []).find((e) => e.id === entryId) ?? null;
  if (!isOpen || entry === null) return null;
  const variant = isMobile ? 'bottom-sheet' : 'right-drawer';
  const variantClasses =
    variant === 'bottom-sheet'
      ? 'fixed inset-x-0 bottom-0 max-h-[85vh] rounded-t-lg border-t'
      : 'fixed inset-y-0 right-0 w-full sm:w-96 border-l';
  return (
    <aside
      className={`${variantClasses} bg-background shadow-xl z-50 p-6 overflow-y-auto`}
      role="dialog"
      aria-label={`Edit plan entry for ${entry.recipeTitle}`}
      data-testid="plan-entry-edit-sheet"
      data-variant={variant}
    >
      <Header entry={entry} onClose={onClose} />
      {entry.recipeRunId === null ? (
        <PlanEntryEditForm entry={entry} onSaved={onClose} onDeleted={onClose} />
      ) : (
        <CookedBody entry={entry} />
      )}
    </aside>
  );
}

function Header(props: { entry: WirePlanEntryRow; onClose: () => void }): ReactElement {
  return (
    <header className="flex items-start justify-between mb-4">
      <div>
        <h2 className="text-lg font-semibold">
          <Link
            to={`/food/recipes/${props.entry.recipeSlug}`}
            className="underline-offset-2 hover:underline"
          >
            {props.entry.recipeTitle}
          </Link>
        </h2>
        <p className="text-sm text-muted-foreground">
          {props.entry.date} — {props.entry.slot}
        </p>
      </div>
      <Button variant="ghost" size="sm" onClick={props.onClose} aria-label="Close edit sheet">
        ×
      </Button>
    </header>
  );
}

function CookedBody({ entry }: { entry: WirePlanEntryRow }): ReactElement {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        Cooked on <span className="font-medium">{entry.recipeRunCookedAt ?? 'unknown'}</span>
      </p>
      <p>Planned servings: {entry.plannedServings}</p>
      {entry.notes !== null && <p>Notes: {entry.notes}</p>}
      <Link
        to={`/food/recipes/${entry.recipeSlug}/runs/${entry.recipeRunId ?? ''}`}
        className="underline text-sm"
      >
        View cook record
      </Link>
    </div>
  );
}
