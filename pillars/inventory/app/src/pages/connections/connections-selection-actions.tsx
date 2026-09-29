import { Tag, Unlink, Waypoints } from 'lucide-react';

import { OFFLINE_REASON } from '../../foundation/feedback/state-banner.js';
import { SelectionBar } from '../../foundation/selection/selection-bar.js';

import type { ReactElement } from 'react';

import type { SelectionBarAction } from '../../foundation/model/contracts.js';
import type { ConnectionsPageModel } from './connections-page-model.js';

/** Props for the bulk selection action bar. */
export interface ConnectionsSelectionActionsProps {
  readonly model: ConnectionsPageModel;
  readonly online: boolean;
  readonly onDisconnect: () => void;
  readonly onTrace: () => void;
  readonly onLabels: () => void;
}

/** Renders disconnect, trace, and label actions for selected connection rows. */
export function ConnectionsSelectionActions({
  model,
  online,
  onDisconnect,
  onTrace,
  onLabels,
}: ConnectionsSelectionActionsProps): ReactElement {
  const selectedRow =
    model.selection.count === 1
      ? model.resolvedRows.find((row) => model.selection.isSelected(row.id))
      : undefined;
  const actions: SelectionBarAction[] = [
    {
      id: 'disconnect',
      label: `Disconnect ${model.selection.count}`,
      icon: Unlink,
      disabledReason: online ? undefined : OFFLINE_REASON,
      onSelect: onDisconnect,
    },
    {
      id: 'trace',
      label: 'Trace',
      icon: Waypoints,
      disabledReason:
        selectedRow === undefined ? 'Trace works on one connection at a time.' : undefined,
      onSelect: onTrace,
    },
    {
      id: 'label',
      label: 'Print labels',
      icon: Tag,
      shortcutId: 'label',
      onSelect: onLabels,
    },
  ];

  return (
    <SelectionBar
      count={model.selection.count}
      loadedCount={model.resolvedRows.length}
      coverage={model.selection.coverage}
      actions={actions}
      onSelectAll={model.selection.onHeaderToggle}
      onClear={model.selection.clearSelection}
    />
  );
}
