extension InventoryItemFormModel {
    /// Saves the current new item and replaces it with a blank create draft.
    /// The next draft keeps only the placement and type, which are the two
    /// values that make repeated entry useful; every item-specific value is
    /// minted or cleared for the next record.
    internal func submitAndPrepareForAnother() async -> Bool {
        guard mode == .create, await submit() else { return false }
        prepareForAnother()
        return true
    }

    private func prepareForAnother() {
        let placement = draft.placement
        let placementName = draft.placementName
        let legacyTypeKey = draft.typeKey
        let nextProtocol2: InventoryProtocol2Draft?
        if let type = protocol2Type {
            var next = InventoryProtocol2Draft(
                type: type,
                catalogueRevision: protocol2Draft?.catalogueRevision
                    ?? protocol2Catalogue?.revision.revision ?? 0)
            next.prefillDefaults(for: type)
            next.typeSelectionChanged = true
            nextProtocol2 = next
        } else {
            nextProtocol2 = nil
        }

        cancelScanPrefill()
        draft = InventoryItemDraft(
            id: mintId(), placement: placement, placementName: placementName)
        draft.typeKey = legacyTypeKey
        if isOffline { draft.code.assist = .offline }
        protocol2ComputedDisplays = [:]
        protocol2ComputedMissingInputs = [:]
        protocol2Draft = nextProtocol2
        showsValidation = false
        freeCode = nil
        failure = nil
        codeSuggestionFailure = nil
        scanFailure = nil
        prefillFailure = nil
        prefillStatus = nil
        created = false
        removedPhotos = [:]
        localPhotoData = [:]
        photoRunner.undoOffer = nil
        photoRunner.failure = nil
        formGeneration += 1
    }
}
