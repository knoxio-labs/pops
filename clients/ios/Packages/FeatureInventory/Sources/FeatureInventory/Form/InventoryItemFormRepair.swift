import AppCore

/// Edit item on a `catalogueChanged` repair (POPS-4494): the held change
/// reopened in the item form against the current fields.
///
/// Every value that still fits is filled into the generic field controls as
/// if the person had just typed it; every value that does not, a reference
/// to a record the field can no longer take included, is listed under the
/// form, struck through with why (`notCarried`), and its picker offers only
/// the records the field allows. Saving settles
/// the repair with the edited protocol-2 change in the held one's place in
/// the queue (`InventoryRepairChoice.replaceMine`), then sends whatever else
/// the form changed (a code, a place) as ordinary changes.
extension InventoryItemFormModel {
    /// Fills the form from the repair `context` carries, and answers the
    /// phase that leaves it in: unavailable when the repair, its change or
    /// the item it edits is gone.
    internal func seedRepair(_ context: InventoryItemFormContext) -> Phase {
        guard let catalogue = context.protocol2Catalogue,
            let queued = context.repair?.catalogue?.queued
        else { return .unavailable }
        let changes = context.repair?.catalogue?.changes ?? []
        notCarried = context.repairDetail?.values.filter(\.fit.blocks) ?? []
        switch queued {
        case .createProtocol2Item(let new):
            repairMode = .create
            draft = InventoryItemDraft(
                id: new.id, placement: new.placement, placementName: context.placementName)
            draft.name = new.name
            draft.note = new.note ?? ""
            draft.quantity = new.quantity
            draft.identifiers = new.externalIds.map(InventoryIdentifierDraft.init)
            seedValues(
                typeId: landingType(new.typeId, in: catalogue, changes: changes),
                values: new.values.map { ($0.fieldId, $0.values) }, catalogue: catalogue)
        case .editProtocol2Item(_, _, let patches):
            guard let item = seedEditing(context), let typeId = item.typeId else {
                return .unavailable
            }
            seedValues(
                typeId: typeId, values: patches.map { ($0.fieldId, $0.values ?? []) },
                catalogue: catalogue, item: item)
        case .changeProtocol2ItemType(_, _, let typeId, let values):
            guard seedEditing(context) != nil else { return .unavailable }
            seedValues(
                typeId: landingType(typeId, in: catalogue, changes: changes),
                values: values.map { ($0.fieldId, $0.values) }, catalogue: catalogue)
        default:
            return .unavailable
        }
        return protocol2Draft == nil ? .unavailable : .ready
    }

    /// Settles the repair with the edited change, then sends the rest.
    /// Returns true when all of it landed and the form can close.
    internal func submitRepair(_ repairId: InventoryRepair.ID, commands: [InventoryCommand]) async
        -> Bool
    {
        let primary = commands.firstIndex { $0.isProtocol2Change }
        do {
            let choice: InventoryRepairChoice =
                primary.map { .replaceMine(commands[$0]) } ?? .discardMine
            try await store.resolve(repairId, with: choice)
            for (index, command) in commands.enumerated() where index != primary {
                _ = try await store.perform(command)
            }
        } catch {
            record(error)
            return false
        }
        return true
    }

    private func seedEditing(_ context: InventoryItemFormContext) -> InventoryItem? {
        guard let item = context.item else { return nil }
        repairMode = .edit
        draft = InventoryItemDraft(editing: item, placementName: context.placementName)
        return item
    }

    /// The type the change lands on: its own while it is live, else the one
    /// the server named as its replacement, else the first live type, for
    /// the person to change.
    private func landingType(
        _ typeId: String, in catalogue: InventoryCatalogueSnapshot,
        changes: [InventoryCatalogueChange]
    ) -> String {
        let live = catalogue.types.filter { $0.archivedAt == nil }
        if live.contains(where: { $0.id == typeId }) { return typeId }
        let replacement = changes.first { $0.definition == .type && $0.id == typeId }?.replacementId
        if let replacement, live.contains(where: { $0.id == replacement }) { return replacement }
        return live.first?.id ?? typeId
    }

    private func seedValues(
        typeId: String, values: [(String, [InventoryPrimitiveValue])],
        catalogue: InventoryCatalogueSnapshot, item: InventoryItem? = nil
    ) {
        guard let type = catalogue.types.first(where: { $0.id == typeId }) else { return }
        var seeded = InventoryProtocol2Draft(
            type: type, catalogueRevision: catalogue.revision.revision, item: item)
        seeded.typeSelectionChanged = item == nil && original?.typeId != typeId
        let staleReferences = Set(notCarried.filter(\.fit.isStaleReference).map(\.id))
        for (fieldId, primitives) in values {
            guard let field = type.fields.first(where: { $0.id == fieldId }),
                field.archivedAt == nil, Self.fits(primitives, field),
                !staleReferences.contains(fieldId)
            else { continue }
            seeded.prefill(primitives, for: field)
        }
        protocol2Draft = seeded
    }

    private static func fits(
        _ values: [InventoryPrimitiveValue], _ field: InventoryCatalogueField
    ) -> Bool {
        values.allSatisfy { value in
            guard case .enumeration(let optionId) = value else { return true }
            return field.enumOptions.contains { $0.id == optionId && $0.archivedAt == nil }
        }
    }
}

extension InventoryCommand {
    /// A protocol-2 new item, edit or type change: what a catalogue repair
    /// holds, and so what an edited one replaces.
    internal var isProtocol2Change: Bool {
        switch self {
        case .createProtocol2Item, .editProtocol2Item, .changeProtocol2ItemType: true
        default: false
        }
    }
}
