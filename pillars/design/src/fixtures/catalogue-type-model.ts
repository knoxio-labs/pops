/** The lifecycle values shown by the catalogue type editor. */
export type CatalogueTypeStatus = 'published' | 'draft' | 'archived';

/** A catalogue type row shared by the inventory fixture populations. */
export interface CatalogueTypeSummary {
  id: string;
  key: string;
  label: string;
  parentTypeId: string | null;
  description: string;
  status: CatalogueTypeStatus;
  itemCount: number;
  fieldCount: number;
  capabilities: readonly string[];
}
