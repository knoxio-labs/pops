import AppCore

extension InventoryItemFormModel {
    internal var protocol2Type: InventoryCatalogueType? {
        guard let draft = protocol2Draft else { return nil }
        return protocol2Catalogue?.effectiveType(id: draft.typeId)
    }

    internal var protocol2Issues: [InventoryProtocol2DraftIssue] {
        guard let draft = protocol2Draft, let type = protocol2Type else { return [] }
        return draft.issues(for: type)
    }

    internal func referenceTargets(
        for field: InventoryCatalogueField
    ) -> [InventoryProtocol2ReferenceTarget] {
        InventoryProtocol2ReferenceTargets.allowed(
            for: field, among: protocol2ReferenceTargets, catalogue: protocol2Catalogue)
    }

    internal func selectProtocol2Type(_ typeId: String?) {
        guard let typeId else {
            guard offersNoType else { return }
            protocol2Draft = nil
            return
        }
        guard let catalogue = protocol2Catalogue,
            let found = catalogue.types.first(where: {
                $0.id == typeId && $0.archivedAt == nil
            }),
            let type = catalogue.effectiveType(id: found.id)
        else { return }
        let catalogueRevision = protocol2Draft?.catalogueRevision ?? catalogue.revision.revision
        guard protocol2Draft?.typeId != typeId else { return }
        var selected = InventoryProtocol2Draft(type: type, catalogueRevision: catalogueRevision)
        if let current = protocol2Draft {
            let fieldIds = Set(type.fields.map(\.id))
            selected.entries = Dictionary(
                uniqueKeysWithValues: current.entries.filter { fieldIds.contains($0.key) })
            selected.touched = current.touched.intersection(fieldIds)
            selected.overrides = Dictionary(
                uniqueKeysWithValues: current.overrides.filter { fieldIds.contains($0.key) })
        }
        if case .create = request { selected.prefillDefaults(for: type) }
        selected.typeSelectionChanged = true
        protocol2Draft = selected
        if type.isContainer { self.draft.quantity = 1 }
    }

    internal func addProtocol2Value(for field: InventoryCatalogueField) {
        protocol2Draft?.addEntry(id: mintProtocol2ValueId(), for: field)
    }
}
