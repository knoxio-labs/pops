import { useInHandPageModel } from './in-hand-page-model.js';
import { InHandPageView } from './in-hand-page-parts.js';

import type { ReactElement } from 'react';

/** Renders the inventory In hand page. */
export function InHandPage(): ReactElement {
  const model = useInHandPageModel();
  return (
    <InHandPageView
      data={model.data}
      actions={model.actions}
      selectionActions={model.selectionActions}
    />
  );
}
