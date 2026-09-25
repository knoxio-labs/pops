/**
 * `/inventory/types/:id/arrived`: a newly published type asks, once, to
 * adopt the untyped items filed under its old labels. Every match starts
 * ticked; Apply types the ticked ones with Undo; Not now leaves them untyped
 * and the page does not ask again.
 */
import { useReducer } from 'react';

import { Button, Card, Skeleton } from '@pops/ui';

import { InventoryPage, ToastDock } from '../overview/inventory-page';
import { INVENTORY_ICONS } from '../shared/icons';
import { ShortcutHint } from '../shared/kbd';
import { UndoToast } from '../shared/undo-toast';
import { TypeArrivedList } from './type-arrived-list';
import { appliedMessage, applyLabel, matchesFor, tickReducer } from './type-arrived-model';

import type { PlacementWorld } from '../shared/placement-model';
import type { ArrivedType, TickAction, UntypedItem } from './type-arrived-model';

/** Where the review stands. */
export type TypeArrivedStage = 'review' | 'applied' | 'not-now' | 'loading';

/** Props for {@link TypeArrivedPage}. */
export interface TypeArrivedPageProps {
  type: ArrivedType;
  untyped: readonly UntypedItem[];
  world: PlacementWorld;
  stage?: TypeArrivedStage;
  /** Ids left unticked when the page opens, for review. */
  unticked?: readonly string[];
}

function labels(type: ArrivedType): string {
  return type.legacyLabels.map((label) => `“${label}”`).join(' or ');
}

function describe(
  stage: TypeArrivedStage,
  type: ArrivedType,
  matched: number,
  ticked: number
): string {
  const published = `Revision ${type.revision} published ${type.name}.`;
  if (matched === 0) return `${published} It claims items filed as ${labels(type)}.`;
  if (stage === 'applied') {
    const left = matched - ticked;
    return `${published} ${ticked} items are now ${type.name}.${left > 0 ? ` ${left} left untyped.` : ''}`;
  }
  return `${published} ${matched} untyped items were filed as ${labels(type)}. Untick any that are not ${type.name}.`;
}

function Outcome({ title, detail, action }: { title: string; detail: string; action: string }) {
  return (
    <Card className="mx-auto mt-6 w-full max-w-lg items-center gap-3 px-6 py-8 text-center">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{detail}</p>
      <Button size="sm" variant="outline">
        {action}
      </Button>
    </Card>
  );
}

function Actions({ count, onNotNow }: { count: number; onNotNow?: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={onNotNow}>
        Not now
      </Button>
      <Button
        size="sm"
        disabled={count === 0}
        suffix={
          <ShortcutHint
            id="form-save"
            className="[&_kbd]:border-primary-foreground/30 [&_kbd]:bg-primary-foreground/15 [&_kbd]:text-primary-foreground"
          />
        }
      >
        {applyLabel(count)}
      </Button>
    </div>
  );
}

interface BodyProps {
  stage: TypeArrivedStage;
  type: ArrivedType;
  matches: readonly UntypedItem[];
  world: PlacementWorld;
  ticked: ReadonlySet<string>;
  dispatch: (action: TickAction) => void;
}

function Body({ stage, type, matches, world, ticked, dispatch }: BodyProps) {
  if (stage === 'loading') return <Skeleton className="h-72 w-full rounded-lg" />;
  if (matches.length === 0) {
    return (
      <Outcome
        title="Nothing to adopt"
        detail={`No untyped item is filed as ${labels(type)}. New items can use ${type.name} from now on.`}
        action={`Open ${type.name}`}
      />
    );
  }
  if (stage === 'not-now') {
    return (
      <Outcome
        title={`${matches.length} items left untyped`}
        detail={`${type.name} will not ask about them again. To type them later, filter Items by Untyped and use Set type.`}
        action="Open untyped items"
      />
    );
  }
  const all = matches.map((entry) => entry.item.id);
  return (
    <TypeArrivedList
      matches={matches}
      world={world}
      ticked={ticked}
      appliedType={stage === 'applied' ? type.name : undefined}
      onToggle={(id) => dispatch({ type: 'toggle', id })}
      onToggleAll={() =>
        dispatch(ticked.size === all.length ? { type: 'none' } : { type: 'all', ids: all })
      }
    />
  );
}

const NONE: readonly string[] = [];

/** The page. */
export function TypeArrivedPage({
  type,
  untyped,
  world,
  stage = 'review',
  unticked = NONE,
}: TypeArrivedPageProps) {
  const matches = matchesFor(type, untyped);
  const [ticked, dispatch] = useReducer(
    tickReducer,
    new Set(matches.map((entry) => entry.item.id).filter((id) => !unticked.includes(id)))
  );
  const reviewing = stage === 'review' && matches.length > 0;
  const description = describe(stage, type, matches.length, ticked.size);
  return (
    <InventoryPage
      title={`New type: ${type.name}`}
      icon={INVENTORY_ICONS.type}
      description={description}
      breadcrumbs={[{ label: 'Types', href: '/inventory/types' }, { label: type.name }]}
      actions={reviewing ? <Actions count={ticked.size} /> : undefined}
      className="gap-3"
      overlay={
        stage === 'applied' ? (
          <ToastDock>
            <UndoToast concept="type" message={appliedMessage(ticked.size, type.name)} />
          </ToastDock>
        ) : undefined
      }
    >
      <Body
        stage={stage}
        type={type}
        matches={matches}
        world={world}
        ticked={ticked}
        dispatch={dispatch}
      />
    </InventoryPage>
  );
}
