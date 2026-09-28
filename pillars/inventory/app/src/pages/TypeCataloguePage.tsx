import { toast } from 'sonner';

import { TypeCatalogueLayout } from './TypeCatalogueLayout';
import { useTypeCataloguePage } from './useTypeCataloguePage';

import type { CatalogueOperation } from '../catalogue-editor/types';

/** Owner-facing production editor for the persisted Inventory type catalogue. */
export function TypeCataloguePage() {
  const page = useTypeCataloguePage();
  if (page.loading)
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">Loading type catalogue…</p>
    );
  if (page.catalogue === undefined)
    return <TypeCatalogueLayout.Error onRetry={() => void page.reload()} />;
  const readyPage = { ...page, catalogue: page.catalogue };
  async function applyOperation(operation: CatalogueOperation): Promise<boolean> {
    const created = await page.applyOperation(operation);
    if (created === null) return false;
    if (created === 'type') toast.success('Type created');
    else if (created === 'field') toast.success('Field created');
    else toast.success('Draft saved');
    return true;
  }
  return (
    <TypeCatalogueLayout
      page={readyPage}
      onOperation={applyOperation}
      onAbandon={() => page.abandon(() => toast.success('Draft abandoned'))}
      onPublish={(input) =>
        page.publish(input, () => {
          page.setAuditOpen(false);
          toast.success('Catalogue published');
        })
      }
    />
  );
}
