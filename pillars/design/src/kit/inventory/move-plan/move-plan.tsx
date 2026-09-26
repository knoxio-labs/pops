/**
 * The preview a bulk move is confirmed from (spec 3.3): the target, what
 * moves, what rides along inside, what is already there and what cannot go,
 * all stated before the button, which carries the real count.
 */
import { Button, cn } from '@pops/ui';

import { INVENTORY_ICONS } from '../shared/icons';
import { PlacementPath } from '../shared/placement-path';
import { affectedCount, planIsApplicable, refusalText } from './move-plan-model';

import type { ItemRowModel } from '../shared/model';
import type { PlacementWorld } from '../shared/placement-model';
import type { MovePlan } from './move-plan-model';

/** Props for {@link MovePlanPanel}. */
export interface MovePlanPanelProps {
  plan: MovePlan;
  world: PlacementWorld;
  onApply?: () => void;
  onCancel?: () => void;
  onChangeTarget?: () => void;
  busy?: boolean;
}

function things(count: number): string {
  return count === 1 ? '1 item' : `${count} items`;
}

function breakdown(plan: MovePlan): string {
  const parts = [`${plan.moving.length} selected`];
  if (plan.carried.length > 0) parts.push(`${plan.carried.length} inside them`);
  if (plan.alreadyThere.length > 0) parts.push(`${plan.alreadyThere.length} already there`);
  if (plan.blocked.length > 0) parts.push(`${plan.blocked.length} cannot move`);
  return parts.join(', ');
}

type Line = {
  item: ItemRowModel;
  tag: string;
  tone: 'moves' | 'carried' | 'quiet' | 'blocked';
  note?: string;
};

function lines(plan: MovePlan, world: PlacementWorld): Line[] {
  const refused = plan.targetRefusal !== null;
  const insideOf = (entry: ItemRowModel): string =>
    entry.placement.kind === 'container'
      ? `In ${world.items.get(entry.placement.containerId)?.name ?? 'a container'}`
      : 'Carried';
  return [
    ...plan.moving.map((item): Line =>
      refused ? { item, tag: 'Would move', tone: 'quiet' } : { item, tag: 'Moves', tone: 'moves' }
    ),
    ...plan.carried.map((item): Line => ({ item, tag: insideOf(item), tone: 'carried' })),
    ...plan.alreadyThere.map((item): Line => ({ item, tag: 'Already there', tone: 'quiet' })),
    ...plan.blocked.flatMap((blocker): Line[] => {
      const item = world.items.get(blocker.itemId);
      return item ? [{ item, tag: 'Stays', tone: 'blocked', note: blocker.reason }] : [];
    }),
  ];
}

function PlanLine({ line }: { line: Line }) {
  return (
    <li
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 text-sm',
        line.tone === 'carried' && 'pl-8',
        line.tone !== 'moves' && 'text-muted-foreground'
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate">{line.item.name}</span>
        {line.note ? (
          <span className="block text-xs text-muted-foreground">{line.note}</span>
        ) : null}
      </span>
      <span
        className={cn('shrink-0 text-xs', line.tone === 'blocked' && 'font-medium text-foreground')}
      >
        {line.tag}
      </span>
    </li>
  );
}

function PlanSummary({ plan, total }: { plan: MovePlan; total: number }) {
  const refusal = refusalText(plan);
  const full = plan.targetFull && refusal === null ? `. ${plan.targetName} is marked full.` : '';
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2',
        refusal ? 'border-warning bg-warning/10' : 'border-app-accent/40 bg-app-accent/10'
      )}
    >
      <p className="text-sm font-medium">
        {refusal ?? `${things(total)} end up in ${plan.targetName}`}
      </p>
      <p className="text-xs text-muted-foreground">
        {refusal ? 'Nothing moves until the target can take it.' : breakdown(plan)}
        {full}
      </p>
    </div>
  );
}

function TargetLine({
  plan,
  world,
  onChangeTarget,
}: Pick<MovePlanPanelProps, 'plan' | 'world' | 'onChangeTarget'>) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">To</span>
      <PlacementPath
        world={world}
        placement={plan.target}
        maxSegments={4}
        className="min-w-0 flex-1 text-sm"
      />
      {onChangeTarget ? (
        <Button size="sm" variant="outline" onClick={onChangeTarget}>
          Change
        </Button>
      ) : null}
    </div>
  );
}

/** The move preview panel. */
export function MovePlanPanel({
  plan,
  world,
  onApply,
  onCancel,
  onChangeTarget,
  busy = false,
}: MovePlanPanelProps) {
  const total = affectedCount(plan);
  const applicable = planIsApplicable(plan);
  const Move = INVENTORY_ICONS.move;
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <TargetLine plan={plan} world={world} onChangeTarget={onChangeTarget} />
      <PlanSummary plan={plan} total={total} />
      <ul
        aria-label="What happens to each item"
        className="max-h-48 min-h-0 divide-y divide-border/60 overflow-y-auto rounded-lg border"
      >
        {lines(plan, world).map((line) => (
          <PlanLine key={`${line.tone}-${line.item.id}`} line={line} />
        ))}
      </ul>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={onApply}
          disabled={!applicable || busy}
          loading={busy}
          prefix={<Move className="size-4" aria-hidden />}
        >
          {applicable ? `Move ${things(total)}` : 'Move'}
        </Button>
      </div>
    </div>
  );
}
