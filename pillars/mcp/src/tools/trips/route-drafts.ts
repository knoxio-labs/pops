/** Source-aware deletion previews and replayable mutations for alternative route drafts. */
export const routeDraftOperations = {
  'routeDrafts.preview':
    'Preview deleting one alternative route path. Review the explicit source selection, retained records and deletion candidates; this operation does not change the route or its sources.',
  'routeDrafts.operate':
    'Delete a selected alternative route path or undo a prior deletion using the producer’s exact revision, preview fingerprint and operation receipt. Preserve the original operationId and complete arguments for replay after an unknown response.',
};
