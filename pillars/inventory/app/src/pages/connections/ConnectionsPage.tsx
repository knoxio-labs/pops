import { useConnectionsPageActions } from './connections-page-actions.js';
import { useConnectionsPageModel } from './connections-page-model.js';
import { ConnectionsPageView } from './connections-page-view.js';

import type { ReactElement } from 'react';

/** Renders the server-backed Connections registry, graph, trace, and actions. */
export function ConnectionsPage(): ReactElement {
  const model = useConnectionsPageModel();
  const actions = useConnectionsPageActions(model);
  return <ConnectionsPageView model={model} actions={actions} />;
}
