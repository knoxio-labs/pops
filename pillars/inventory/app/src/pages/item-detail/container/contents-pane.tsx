import { useMemo, useState } from 'react';

import { useSelection } from '../../../foundation/selection/use-selection.js';
import { ContentsPaneLayout } from './contents-layout.js';
import { DEFAULT_CONTENTS_SORT, visibleContentRows, type ContentsSort } from './contents-model.js';
import { useContentsPaneActions } from './contents-pane-actions.js';
import { exitRefusal } from './unpack-model.js';

import type { ReactElement } from 'react';

import type { ContentsPaneProps } from './workspace-types.js';

/** Renders a filterable, selectable, contents-first container pane. */
export function ContentsPane(props: ContentsPaneProps): ReactElement {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ContentsSort>(DEFAULT_CONTENTS_SORT);
  const rows = useMemo(
    () => visibleContentRows(props.inside, props.world, query, sort),
    [props.inside, props.world, query, sort]
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
      sort={sort}
      rows={rows}
      selection={selection}
      actions={actions}
      refusal={refusal}
      onQuery={setQuery}
      onSort={setSort}
    />
  );
}
