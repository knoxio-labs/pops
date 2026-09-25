/**
 * `/inventory/items/bulk-new`: many items at once in a grid. Rows are
 * checked against the real rules; Create adds every ready row and leaves
 * the rest in the grid with their reasons (partial accept, owner decision
 * 3). New rows go to the page's default place unless a row says otherwise.
 */
import { ListPlus } from 'lucide-react';

import { Button, Select } from '@pops/ui';

import { PlacementPath } from '../foundation';
import { ListBody, ListPage } from '../items-list/list-page';
import { BulkActionBar } from './bulk-action-bar';
import { BulkGridHeader, BulkGridRow } from './bulk-grid';
import { BulkBanner } from './bulk-status';
import { isBlank, validateRows } from './row-validation';

import type { PlacementTarget, PlacementWorld } from '../foundation';
import type { RowStatus } from './bulk-grid';
import type { BulkCounts, BulkPhase } from './bulk-status';
import type { BulkDraft } from './paste-parser';
import type { BulkContext, BulkIssue } from './row-validation';

/** Props for {@link BulkPage}. */
export interface BulkPageProps {
  phase: BulkPhase;
  rows: readonly BulkDraft[];
  context: BulkContext;
  world: PlacementWorld;
  destination: PlacementTarget;
  types: readonly { value: string; label: string }[];
  created?: number;
  pasteNote?: string;
}

/** Empty rows kept under the last typed one, so there is always somewhere to type. */
const SPARE_ROWS = 3;

const BLANK: BulkDraft = { name: '', type: '', quantity: '', code: '', where: '', note: '' };

function checked(phase: BulkPhase): boolean {
  return phase !== 'editing' && phase !== 'validating' && phase !== 'created';
}

function statusOf(draft: BulkDraft, issues: readonly BulkIssue[], phase: BulkPhase): RowStatus {
  if (isBlank(draft)) return 'blank';
  if (!checked(phase)) return 'unchecked';
  return issues.length > 0 ? 'refused' : 'ready';
}

function Defaults({
  world,
  destination,
  types,
}: Pick<BulkPageProps, 'world' | 'destination' | 'types'>) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <span className="text-muted-foreground">Rows without a Where go to</span>
      <PlacementPath world={world} placement={destination} maxSegments={3} className="shrink-0" />
      <Button size="sm" variant="outline">
        Change
      </Button>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      <span className="text-muted-foreground">Rows without a Type are</span>
      <div className="w-44">
        <Select
          size="sm"
          aria-label="Default type"
          value=""
          placeholder="Untyped"
          options={[...types]}
          onChange={() => undefined}
        />
      </div>
    </div>
  );
}

/** The bulk entry page. */
export function BulkPage(props: BulkPageProps) {
  const { phase, rows, context } = props;
  const issues = validateRows(rows, context);
  const typed = rows.filter((row) => !isBlank(row));
  const refusedRows = new Set(issues.map((issue) => issue.row));
  const counts: BulkCounts = {
    rows: typed.length,
    refused: checked(phase) ? refusedRows.size : 0,
    ready: typed.length - refusedRows.size,
    created: props.created ?? 0,
  };
  const grid = [...rows, ...Array.from({ length: SPARE_ROWS }, () => BLANK)];
  const nextBlank = grid.findIndex((row) => isBlank(row));
  const destination = destinationName(props);
  return (
    <ListPage
      title="Bulk entry"
      icon={ListPlus}
      description="Add many items at once. Ready rows are created; rows that need fixing stay here."
      banner={
        <BulkBanner
          phase={phase}
          counts={counts}
          pasteNote={props.pasteNote ?? ''}
          destination={destination}
        />
      }
      toolbar={<Defaults world={props.world} destination={props.destination} types={props.types} />}
      dock={<BulkActionBar phase={phase} counts={counts} />}
    >
      <ListBody>
        <div
          role="grid"
          aria-label="Items to create"
          aria-busy={phase === 'submitting' || phase === 'validating'}
        >
          <BulkGridHeader />
          {grid.map((draft, index) => {
            const own = checked(phase) ? issues.filter((issue) => issue.row === index) : [];
            return (
              <BulkGridRow
                key={`row-${String(index)}`}
                draft={draft}
                index={index}
                status={statusOf(draft, own, phase)}
                issues={own}
                disabled={phase === 'submitting'}
                hintWhere={index === nextBlank ? destination : undefined}
              />
            );
          })}
        </div>
      </ListBody>
    </ListPage>
  );
}

function destinationName({
  world,
  destination,
}: Pick<BulkPageProps, 'world' | 'destination'>): string {
  if (destination.kind === 'in-hand') return 'In hand';
  if (destination.kind === 'location')
    return world.locations.get(destination.locationId)?.name ?? 'the default place';
  return world.items.get(destination.containerId)?.name ?? 'the default place';
}
