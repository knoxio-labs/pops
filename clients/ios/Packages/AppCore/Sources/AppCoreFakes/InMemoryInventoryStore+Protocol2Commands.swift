import AppCore
import Foundation

extension InMemoryInventoryStore {
    internal struct ItemEdit {
        let name: String?
        let note: InventoryFieldUpdate<String>
        let fields: [String: InventoryFieldValue?]
        let externalIds: [InventoryExternalIdentifier]?
    }

    internal struct Protocol2TypeChange {
        let catalogueRevision: Int
        let typeId: String
        let values: [InventoryProtocol2FieldValue]
    }

    internal static func applyCreateProtocol2Item(
        _ new: InventoryNewProtocol2Item, mutationId: String, into state: inout State
    ) throws {
        guard state.items[new.id] == nil, new.quantity >= 1 else {
            throw RepositoryError.contractMismatch
        }
        let now = Date()
        let item = InventoryItem(
            id: new.id, revision: 1, seq: state.nextSeq,
            catalogueRevision: new.catalogueRevision, name: new.name, typeId: new.typeId,
            typeKey: nil,
            fieldValues: protocol2Entries(new.values, revision: new.catalogueRevision),
            note: new.note, externalIds: new.externalIds,
            quantity: InventoryQuantity(count: new.quantity), placement: new.placement,
            createdAt: now, updatedAt: now)
        state.nextSeq += 1
        state.items[new.id] = item
        state.undoLog[mutationId] = .item(nil)
    }

    internal static func applyEditProtocol2Item(
        id: InventoryItem.ID, catalogueRevision: Int, values: [InventoryProtocol2FieldPatch],
        mutationId: String, into state: inout State
    ) throws {
        let item = try require(state.items[id])
        guard item.catalogueRevision == catalogueRevision else {
            throw RepositoryError.contractMismatch
        }
        state.undoLog[mutationId] = .item(item)
        state.items[id] = bumped(
            item, seq: &state.nextSeq,
            fieldValues: .set(protocol2PatchedEntries(item.fieldValues, patches: values)))
    }

    internal static func applyChangeProtocol2ItemType(
        id: InventoryItem.ID, change: Protocol2TypeChange, mutationId: String,
        into state: inout State
    ) throws {
        let item = try require(state.items[id])
        state.undoLog[mutationId] = .item(item)
        let bumpedItem = bumped(item, seq: &state.nextSeq)
        state.items[id] = protocol2Retyped(
            bumpedItem, catalogueRevision: change.catalogueRevision, typeId: change.typeId,
            fieldValues: protocol2Entries(change.values, revision: change.catalogueRevision),
            isContainer: false)
    }

    private static func protocol2Entries(
        _ values: [InventoryProtocol2FieldValue], revision: Int
    ) -> [InventoryItemFieldEntry] {
        values.map {
            .init(
                fieldId: $0.fieldId, state: .value($0.values), source: .stored,
                catalogueRevision: revision)
        }
    }

    private static func protocol2PatchedEntries(
        _ current: [InventoryItemFieldEntry], patches: [InventoryProtocol2FieldPatch]
    ) -> [InventoryItemFieldEntry] {
        var entries = Dictionary(uniqueKeysWithValues: current.map { ($0.fieldId, $0) })
        for patch in patches {
            if let values = patch.values {
                entries[patch.fieldId] = .init(
                    fieldId: patch.fieldId, state: .value(values), source: .stored,
                    catalogueRevision: current.first?.catalogueRevision ?? 1)
            } else {
                entries.removeValue(forKey: patch.fieldId)
            }
        }
        return entries.values.sorted { $0.fieldId < $1.fieldId }
    }
}
