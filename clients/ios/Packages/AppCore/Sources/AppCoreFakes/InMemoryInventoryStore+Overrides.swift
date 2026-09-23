import AppCore

/// `item.setOverride` and `item.clearOverride` for `InMemoryInventoryStore`.
/// Like the replica, the fake cannot evaluate an expression, so clearing an
/// override leaves the field without an entry until a server read supplies
/// the evaluated value.
extension InMemoryInventoryStore {
    static func applyOverrideCommand(
        _ command: InventoryCommand, mutationId: String, into state: inout State
    ) throws {
        switch command {
        case .setComputedOverride(let id, let fieldId, let value):
            let item = try require(state.items[id])
            let revision = try require(item.catalogueRevision)
            let entry = InventoryItemFieldEntry(
                fieldId: fieldId, state: .value([value]), source: .override,
                catalogueRevision: revision)
            state.undoLog[mutationId] = .item(item)
            state.items[id] = bumped(
                item, seq: &state.nextSeq,
                fieldValues: .set(replacing(fieldId, in: item.fieldValues, with: entry)))
        case .clearComputedOverride(let id, let fieldId):
            let item = try require(state.items[id])
            let hasOverride = item.fieldValues.contains {
                $0.fieldId == fieldId && $0.source == .override
            }
            guard hasOverride else { return }
            state.undoLog[mutationId] = .item(item)
            state.items[id] = bumped(
                item, seq: &state.nextSeq,
                fieldValues: .set(replacing(fieldId, in: item.fieldValues, with: nil)))
        default:
            throw RepositoryError.contractMismatch
        }
    }

    private static func replacing(
        _ fieldId: String, in entries: [InventoryItemFieldEntry],
        with entry: InventoryItemFieldEntry?
    ) -> [InventoryItemFieldEntry] {
        guard let index = entries.firstIndex(where: { $0.fieldId == fieldId }) else {
            return entries + [entry].compactMap { $0 }
        }
        var replaced = entries
        if let entry { replaced[index] = entry } else { replaced.remove(at: index) }
        return replaced
    }
}
