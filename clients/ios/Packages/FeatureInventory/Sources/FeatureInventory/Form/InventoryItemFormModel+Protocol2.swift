import AppCore

extension InventoryItemFormModel {
    internal var protocol2Type: InventoryCatalogueType? {
        guard let draft = protocol2Draft else { return nil }
        return protocol2Catalogue?.types.first(where: { $0.id == draft.typeId })
    }

    internal var protocol2Issues: [InventoryProtocol2DraftIssue] {
        guard let draft = protocol2Draft, let type = protocol2Type else { return [] }
        return draft.issues(for: type)
    }

    internal func referenceTargets(
        for field: InventoryCatalogueField
    ) -> [InventoryProtocol2ReferenceTarget] {
        InventoryProtocol2ReferenceTargets.allowed(for: field, among: protocol2ReferenceTargets)
    }

    internal func selectProtocol2Type(_ typeId: String?) {
        guard let typeId else {
            guard offersNoType else { return }
            protocol2Draft = nil
            return
        }
        guard let catalogue = protocol2Catalogue,
            let type = catalogue.types.first(where: {
                $0.id == typeId && $0.archivedAt == nil
            })
        else { return }
        let catalogueRevision = protocol2Draft?.catalogueRevision ?? catalogue.revision.revision
        guard protocol2Draft?.typeId != typeId else { return }
        var selected = InventoryProtocol2Draft(type: type, catalogueRevision: catalogueRevision)
        if case .create = request { selected.prefillDefaults(for: type) }
        selected.typeSelectionChanged = true
        protocol2Draft = selected
        if type.isContainer { self.draft.quantity = 1 }
    }

    internal func addProtocol2Value(for field: InventoryCatalogueField) {
        protocol2Draft?.addEntry(id: mintProtocol2ValueId(), for: field)
    }
}
