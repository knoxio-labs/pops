import { ListPlus } from 'lucide-react';
import { useRef } from 'react';

import { StateBanner } from '../../foundation/feedback/state-banner.js';
import { InventoryPage } from '../../foundation/frame/page-frame.js';
import { ListBody } from '../../foundation/items-table/list-body.js';
import { OfflineBanner } from '../../foundation/list-page/list-states.js';
import { targetName } from '../../foundation/model/placement-model.js';
import { MAX_LABEL_IDS } from '../labels-page/label-params.js';
import { BulkActionBar } from './bulk-action-bar.js';
import { BulkDefaults } from './bulk-defaults.js';
import { BulkGridHeader, BulkGridRow, cellLabel } from './bulk-grid.js';
import { BulkBanner } from './bulk-status.js';

import type { ReactElement } from 'react';

import type { FilterOption } from '../../foundation/list-page/list-filters.js';
import type { PlacementTarget, PlacementWorld } from '../../foundation/model/contracts.js';
import type { BulkEntry } from './use-bulk-entry.js';

/** Props for the rendered bulk-entry inventory frame. */
export interface BulkEntryPageViewProps {
  entry: BulkEntry;
  online: boolean;
  world: PlacementWorld;
  recents: readonly PlacementTarget[];
  types: readonly FilterOption[];
  onDestination: (target: PlacementTarget) => void;
  onDefaultTypeKey: (key: string | null) => void;
  onCreate: () => void;
  onUndo: () => void;
  onShowInItems: () => void;
  onPrintLabels: () => void;
}

function BannerSlot({ props }: { props: BulkEntryPageViewProps }): ReactElement {
  if (!props.online) return <OfflineBanner />;
  if (props.entry.error !== null) {
    return (
      <StateBanner
        kind="error"
        title="Some rows were not sent"
        detail={props.entry.error.message}
      />
    );
  }
  return (
    <BulkBanner
      phase={props.entry.phase}
      counts={props.entry.counts}
      pasteNote={props.entry.pasteNote}
      destination={targetName(props.world, props.entry.destination)}
      progress={props.entry.progress}
      onUndo={props.onUndo}
      onShowInItems={props.onShowInItems}
      onPrintLabels={props.onPrintLabels}
      printDisabledReason={
        props.entry.createdIds.length > MAX_LABEL_IDS
          ? `Print labels takes at most ${MAX_LABEL_IDS} items`
          : undefined
      }
    />
  );
}

function BulkGrid({ entry, destination }: { entry: BulkEntry; destination: string }): ReactElement {
  const gridRef = useRef<HTMLDivElement>(null);
  const nextBlank = entry.rows.findIndex((row) => row.status === 'blank');
  const focusNextRow = (index: number, column: Parameters<typeof cellLabel>[0]): void => {
    const label = cellLabel(column, index + 1);
    const input = [...(gridRef.current?.querySelectorAll<HTMLInputElement>('input') ?? [])].find(
      (candidate) => candidate.getAttribute('aria-label') === label
    );
    input?.focus();
  };

  return (
    <ListBody>
      <div
        ref={gridRef}
        role="grid"
        aria-label="Items to create"
        aria-busy={entry.phase === 'submitting' || entry.phase === 'validating'}
      >
        <BulkGridHeader />
        {entry.rows.map((row, index) => (
          <BulkGridRow
            key={`row-${String(index)}`}
            draft={row.draft}
            index={index}
            status={row.status}
            issues={row.issues}
            disabled={entry.phase === 'submitting'}
            hintWhere={index === nextBlank ? destination : undefined}
            onCell={(column, value) => entry.setCell(index, column, value)}
            onPaste={(text) => entry.paste(text, index)}
            onEnter={(column) => focusNextRow(index, column)}
          />
        ))}
      </div>
    </ListBody>
  );
}

/** Renders the bulk-entry page inside the inventory frame. */
export function BulkEntryPageView(props: BulkEntryPageViewProps): ReactElement {
  const destination = targetName(props.world, props.entry.destination);
  return (
    <InventoryPage
      title="Bulk entry"
      icon={ListPlus}
      description="Add many items at once. Ready rows are created; rows that need fixing stay here."
      banner={<BannerSlot props={props} />}
      toolbar={
        <BulkDefaults
          world={props.world}
          recents={props.recents}
          destination={props.entry.destination}
          onDestination={props.onDestination}
          types={props.types}
          defaultTypeKey={props.entry.defaultTypeKey}
          onDefaultTypeKey={props.onDefaultTypeKey}
        />
      }
      dock={
        <BulkActionBar
          phase={props.entry.phase}
          counts={props.entry.counts}
          offline={!props.online}
          onClear={props.entry.clear}
          onCreate={props.onCreate}
        />
      }
    >
      <BulkGrid entry={props.entry} destination={destination} />
    </InventoryPage>
  );
}
