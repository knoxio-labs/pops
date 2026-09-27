import { Button, Card, Skeleton } from '@pops/ui';

import { ShortcutHint } from '../../foundation/shortcuts/shortcut-hint.js';
import { useShortcutScope } from '../../foundation/shortcuts/shortcut-provider.js';
import { TypeArrivedList } from './type-arrived-list.js';
import { applyLabel, labelsText } from './type-arrived-model.js';

import type { ReactElement } from 'react';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { TickAction, UntypedItem, ArrivedType } from './type-arrived-model.js';
import type { TypeArrivedActions } from './type-arrived-page-state.js';

function Outcome({
  title,
  detail,
  action,
  onAction,
}: {
  title: string;
  detail: string;
  action: string;
  onAction: () => void;
}): ReactElement {
  return (
    <Card className="mx-auto mt-6 w-full max-w-lg items-center gap-3 px-6 py-8 text-center">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{detail}</p>
      <Button size="sm" variant="outline" onClick={onAction}>
        {action}
      </Button>
    </Card>
  );
}

/** Renders loading, outcome, or review content for a Type arrived page. */
export function TypeArrivedBody({
  stage,
  ready,
  type,
  matches,
  world,
  ticked,
  appliedIds,
  matchIds,
  toggle,
  navigate,
}: {
  stage: TypeArrivedActions['stage'];
  ready: boolean;
  type: ArrivedType;
  matches: readonly UntypedItem[];
  world: PlacementWorld;
  ticked: ReadonlySet<string>;
  appliedIds: ReadonlySet<string>;
  matchIds: readonly string[];
  toggle: (action: TickAction) => void;
  navigate: (path: string) => void;
}): ReactElement {
  if (!ready) return <Skeleton className="h-72 w-full rounded-lg" />;
  if (matches.length === 0) {
    return (
      <Outcome
        title="Nothing to adopt"
        detail={`No untyped item is filed as ${labelsText(type)}. New items can use ${type.name} from now on.`}
        action={`Open ${type.name}`}
        onAction={() => navigate(`/inventory/types/${type.id}`)}
      />
    );
  }
  if (stage === 'not-now') {
    return (
      <Outcome
        title={`${matches.length} items left untyped`}
        detail={`${type.name} will not ask about them again. To type them later, filter Items by Untyped and use Set type.`}
        action="Open untyped items"
        onAction={() => navigate('/inventory/items?untyped=1')}
      />
    );
  }
  return (
    <TypeArrivedList
      matches={matches}
      world={world}
      ticked={ticked}
      appliedIds={appliedIds}
      appliedType={stage === 'applied' ? type.name : undefined}
      onToggle={(id) => toggle({ type: 'toggle', id })}
      onToggleAll={() =>
        toggle(ticked.size === matchIds.length ? { type: 'none' } : { type: 'all', ids: matchIds })
      }
    />
  );
}

/** Registers the form-save shortcut while at least one item is ticked. */
export function ApplyShortcut({ onApply }: { onApply: () => void }): null {
  useShortcutScope('form', {
    'form-save': () => {
      onApply();
      return true;
    },
  });
  return null;
}

/** Renders the Not now and Apply actions for the review stage. */
export function TypeArrivedReviewActions({
  count,
  applying,
  onNotNow,
  onApply,
}: {
  count: number;
  applying: boolean;
  onNotNow: () => void;
  onApply: () => void;
}): ReactElement {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={onNotNow} disabled={applying}>
        Not now
      </Button>
      <Button
        disabled={count === 0}
        loading={applying}
        suffix={<ShortcutHint id="form-save" onPrimary />}
        onClick={onApply}
      >
        {applyLabel(count)}
      </Button>
    </div>
  );
}
