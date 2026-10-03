/** Shared facets supported by the tags vocabulary (ADR-056). */
export const SHARED_TAG_FACETS = ['trip', 'hobby', 'project'] as const;

export type SharedTagFacet = (typeof SHARED_TAG_FACETS)[number];
