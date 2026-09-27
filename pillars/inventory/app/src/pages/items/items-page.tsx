import { useItemsPageModel } from './items-page-model.js';
import { ItemsPageView } from './items-page-view.js';

import type { ReactElement } from 'react';

/** Renders the server-backed Items browser and all of its non-selection states. */
export function ItemsPage(): ReactElement {
  return <ItemsPageView model={useItemsPageModel()} />;
}
