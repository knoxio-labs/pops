import type { DirectoryContact } from '../contact-directory/model';

/** Fictional explicit comparison scenarios; they do not represent automated duplicate detection. */
export type DuplicateScenario = 'default' | 'same-name' | 'finance' | 'missing-reference' | 'empty';

/** Selected identities, explicit retained-field choices, and independently owned source references. */
export interface DuplicateState {
  contacts: DirectoryContact[];
  pairIds: string[];
  retainedId: string;
  nameSourceId: string;
  kindSourceId: string;
  references: { id: string; title: string; pillar: string; contactId: string }[];
  separated: boolean;
}

/** Read-only projection preserving optional facts and their original source identities without deduplication. */
export interface MergePreview {
  retainedId: string;
  name: string;
  kind: DirectoryContact['kind'];
  aliases: { sourceId: string; value: string }[];
  methods: { sourceId: string; method: DirectoryContact['methods'][number] }[];
  addresses: { sourceId: string; address: DirectoryContact['addresses'][number] }[];
  notes: { sourceId: string; value: string }[];
  references: {
    id: string;
    title: string;
    pillar: string;
    originalContactId: string;
    resolvedContactId: string;
  }[];
}

/** Resolves only the requested source identities in selection order, without replacing missing records. */
export function duplicateSources(state: DuplicateState): DirectoryContact[] {
  return state.pairIds.flatMap((id) => {
    const source = state.contacts.find((contact) => contact.id === id);
    return source ? [source] : [];
  });
}

/** Explains why an explicit pair cannot be previewed; no name or fact similarity affects validity. */
export function duplicatePreviewError(state: DuplicateState): string | null {
  if (state.separated) return 'This pair is kept separate.';
  if (!state.pairIds.length) return 'Select two contacts to compare.';
  if (state.pairIds.length !== 2 || new Set(state.pairIds).size !== 2)
    return 'Choose two distinct contacts.';
  if (duplicateSources(state).length !== 2) return 'A selected contact is unavailable.';
  if (
    ![state.retainedId, state.nameSourceId, state.kindSourceId].every((id) =>
      state.pairIds.includes(id)
    )
  )
    return 'Choose the retained identity, name and kind from this pair.';
  return null;
}

/** Projects an explicitly selected merge without writing contacts, deleting identities or changing references. */
export function previewDuplicateMerge(state: DuplicateState): MergePreview | null {
  if (duplicatePreviewError(state)) return null;
  const sources = duplicateSources(state);
  const nameSource = sources.find((source) => source.id === state.nameSourceId);
  const kindSource = sources.find((source) => source.id === state.kindSourceId);
  if (!nameSource || !kindSource) return null;
  return {
    retainedId: state.retainedId,
    name: nameSource.name,
    kind: kindSource.kind,
    aliases: sources.flatMap((source) =>
      source.aliases
        .filter((value) => value.trim())
        .map((value) => ({ sourceId: source.id, value }))
    ),
    methods: sources.flatMap((source) =>
      source.methods
        .filter((method) => method.label.trim() || method.value.trim())
        .map((method) => ({ sourceId: source.id, method: { ...method } }))
    ),
    addresses: sources.flatMap((source) =>
      source.addresses
        .filter((address) => address.label.trim() || address.city.trim() || address.value.trim())
        .map((address) => ({ sourceId: source.id, address: { ...address } }))
    ),
    notes: sources.flatMap((source) =>
      source.notes.trim() ? [{ sourceId: source.id, value: source.notes }] : []
    ),
    references: state.references
      .filter((reference) => state.pairIds.includes(reference.contactId))
      .map(({ contactId, ...reference }) => ({
        ...reference,
        originalContactId: contactId,
        resolvedContactId: state.retainedId,
      })),
  };
}

/** Records a local keep-separate choice without changing contacts, source references or selected fields. */
export function separateDuplicatePair(state: DuplicateState): DuplicateState {
  return { ...state, separated: true };
}
