import { useCallback } from 'react';

import { useShortcutScope } from '../../foundation/shortcuts/shortcut-provider.js';
import { useConnectionsPageActions } from './connections-page-actions.js';
import { useConnectionsPageModel } from './connections-page-model.js';
import { ConnectionsPageView } from './connections-page-view.js';

import type { ReactElement } from 'react';

/** Renders the server-backed Connections registry, graph, trace, and actions. */
export function ConnectionsPage(): ReactElement {
  const model = useConnectionsPageModel();
  const actions = useConnectionsPageActions(model);
  const dismiss = useCallback((): boolean => {
    if (model.url.trace === null) return false;
    model.setTrace(null);
    return true;
  }, [model.setTrace, model.url.trace]);
  useShortcutScope('list', { dismiss });
  return <ConnectionsPageView model={model} actions={actions} />;
}
