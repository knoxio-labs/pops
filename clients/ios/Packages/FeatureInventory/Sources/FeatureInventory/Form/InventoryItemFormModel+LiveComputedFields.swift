import AppCore

extension InventoryItemFormModel {
    /// Overlays a live evaluation of every computed field this build can
    /// parse and that is not already overridden onto whatever the server
    /// last sent, so create shows a value nobody has saved yet and edit
    /// shows one an unsaved change already moved (POPS-4836). A field this
    /// build cannot parse, or one an override already fixes, is left exactly
    /// as `apply` set it.
    internal func recomputeProtocol2ComputedFields() {
        guard let protocol2Draft, let type = protocol2Type, let protocol2Catalogue,
            let querySource
        else { return }
        let overridden = Set(
            (original?.fieldValues ?? []).filter { $0.source == .override }.map(\.fieldId))
        let result = InventoryProtocol2LiveComputedFields.evaluate(
            .init(
                type: type, draft: protocol2Draft, rootItemId: draft.id,
                rootRevision: original?.revision ?? 0, rootName: draft.trimmedName,
                overriddenFieldIds: overridden, fieldKinds: protocol2Catalogue.fieldKinds,
                source: querySource))
        for (fieldId, display) in result.displays {
            protocol2ComputedDisplays[fieldId] = display
            protocol2ComputedMissingInputs[fieldId] = result.missingInputs[fieldId]
        }
    }
}
