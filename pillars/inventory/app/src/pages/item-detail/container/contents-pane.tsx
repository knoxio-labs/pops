import { useMemo, useState } from 'react';

import { useSelection } from '../../../foundation/selection/use-selection.js';
import { ContentsPaneLayout } from './contents-layout.js';
import { visibleContentRows } from './contents-model.js';
import { useContentsPaneActions } from './contents-pane-actions.js';
import { exitRefusal } from './unpack-model.js';

import type { ReactElement } from 'react';

import type { PlacementWorld } from '../../../foundation/model/placement-model.js';
import type { ExitKind, UnpackAction, UnpackState } from './unpack-model.js';

/** Props for the contents-first pane of a container workspace. */
export interface ContentsPaneProps {
  name: string;
  home: string;
  world: PlacementWorld;
  inside: readonly string[];
  contentCounts: Readonly<Record<string, { readonly direct: number; readonly deep: number }>>;
  state: UnpackState;
  dispatch: (action: UnpackAction) => void;
  readOnly: boolean;
  readOnlyReason?: string;
  pendingIds: ReadonlySet<string>;
  rejections: Readonly<Record<string, string>>;
  onExit: (ids: readonly string[], how: ExitKind) => void;
  onMove: (ids: readonly string[]) => void;
  onLabel: (ids: readonly string[]) => void;
  onLifecycle: (ids: readonly string[], lifecycle: 'retire' | 'discard') => void;
  onStoreHere?: () => void;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onOpenContainer: () => void;
  onRetire: () => void;
}

/** Renders a filterable, selectable, contents-first container pane. */
export function ContentsPane(props: ContentsPaneProps): ReactElement {
  const [query, setQuery] = useState('');
  const rows = useMemo(
    () => visibleContentRows(props.inside, props.world, query),
    [props.inside, props.world, query]
  );
  const selection = useSelection(rows.map((row) => row.id));
  const actions = useContentsPaneActions({
    selection,
    state: props.state,
    name: props.name,
    readOnlyReason: props.readOnlyReason,
    onExit: props.onExit,
    onMove: props.onMove,
    onLabel: props.onLabel,
    onLifecycle: props.onLifecycle,
  });
  const refusal = props.readOnlyReason ?? exitRefusal(props.state, props.name);
  return (
    <ContentsPaneLayout
      {...props}
      query={query}
      rows={rows}
      selection={selection}
      actions={actions}
      refusal={refusal}
      onQuery={setQuery}
    />
  );
}
