import type {
  TypesManagePatchDraftData,
  TypesManagePatchDraftResponses,
  TypesReadCatalogueResponses,
} from '../inventory-api/types.gen';

/** Catalogue descriptor consumed by the production owner editor. */
export type CatalogueDescriptor = TypesReadCatalogueResponses[200];
/** One item type in a catalogue descriptor. */
export type CatalogueType = CatalogueDescriptor['types'][number];
/** One field in an item-type definition. */
export type CatalogueField = CatalogueType['fields'][number];
/** One enum option in a field definition. */
export type CatalogueEnumOption = CatalogueField['enumOptions'][number];
/** One atomic operation accepted by the catalogue draft endpoint. */
export type CatalogueOperation = NonNullable<
  NonNullable<TypesManagePatchDraftData['body']>['operations']
>[number];
/** Compatibility proof returned after a draft edit. */
export type CatalogueCompatibility = TypesManagePatchDraftResponses[200]['compatibility'];

/** A compatibility result tagged with the draft version it was computed against. */
export type CompatibilitySnapshot = {
  readonly compatibility: CatalogueCompatibility;
  readonly draftVersion: number;
} | null;

/**
 * Publication readiness derived by comparing a {@link CompatibilitySnapshot} against the
 * draft's live version. `stale` means a preview exists but no longer reflects the current
 * draft (it was taken against an earlier draft version); `not_previewed` means no preview
 * has ever been taken for this draft, including one just resumed from persistence.
 */
export type CatalogueReadiness =
  | { readonly status: 'not_previewed' }
  | { readonly status: 'stale' }
  | { readonly status: 'ready'; readonly compatibility: CatalogueCompatibility };

/** Converts an owner-facing label into the stable-key candidate shown by create forms. */
export function catalogueKeyFromLabel(label: string): string {
  return label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
}
