import AppCore
import GRDB

/// The replica's optimistic rows as one evaluation snapshot, the server's
/// `EffectiveValueReader` redone over GRDB: a stored field reads its first
/// stored value at the item's revision; a computed field reads its own
/// evaluation, override first, with that evaluation's dependencies.
///
/// An item the replica has no row for is `missing` once the snapshot has
/// finished downloading and `unresolved` before, since it may simply not have
/// arrived yet. A tombstone is `deleted`, except the root, which the server
/// also still evaluates.
internal final class ReplicaExpressionContext {
    let db: Database
    let catalogue: InventoryCatalogueSnapshot
    private let complete: Bool
    private var items: [String: InventoryItem?] = [:]
    private var evaluated: [String: InventoryComputedValue?] = [:]
    private var evaluating: Set<String> = []

    init(db: Database, catalogue: InventoryCatalogueSnapshot, complete: Bool) {
        self.db = db
        self.catalogue = catalogue
        self.complete = complete
    }

    func item(_ itemId: String) throws -> InventoryItem? {
        if let cached = items[itemId] { return cached }
        let item = try ReplicaQueries.storedItem(id: itemId, in: db)
        items[itemId] = item
        return item
    }

    /// The item's type in this catalogue: by id, or by key for an item the
    /// protocol-1 migration typed, as the override commands resolve it.
    func type(of item: InventoryItem) -> InventoryCatalogueType? {
        catalogue.types.first { candidate in
            if let typeId = item.typeId { return candidate.id == typeId }
            return item.typeKey != nil && candidate.key == item.typeKey
        }
    }

    /// Evaluates one computed field of `item`, or nil when this build cannot:
    /// its expression uses syntax it does not know, or it holds an override
    /// the field forbids. Memoised for the life of the context.
    func evaluate(_ field: InventoryCatalogueField, of item: InventoryItem)
        -> InventoryComputedValue?
    {
        let key = "\(item.id):\(field.id)"
        if let cached = evaluated[key] { return cached }
        guard !evaluating.contains(key) else { return nil }
        evaluating.insert(key)
        defer { evaluating.remove(key) }
        let value = try? InventoryComputedDefinition(field).evaluate(
            override: override(of: field.id, in: item),
            catalogueRevision: catalogue.revision.revision, itemRevision: item.revision,
            in: Snapshot(rootItemId: item.id, context: self))
        evaluated[key] = value
        return value
    }

    private func override(of fieldId: String, in item: InventoryItem) -> InventoryComputedOverride?
    {
        let entry = item.fieldValues.first { $0.fieldId == fieldId && $0.source == .override }
        guard let entry, case .value(let values) = entry.state, let value = values.first else {
            return nil
        }
        return InventoryComputedOverride(value: value, catalogueRevision: entry.catalogueRevision)
    }

    fileprivate func state(of itemId: String, root: String) -> InventoryExpressionItemState {
        guard let item = try? item(itemId) else { return complete ? .missing : .unresolved }
        return item.isDeleted && itemId != root ? .deleted : .resolved(revision: item.revision)
    }

    fileprivate func field(itemId: String, fieldId: String) -> InventoryExpressionField? {
        guard let item = try? item(itemId), let type = type(of: item),
            let field = type.fields.first(where: { $0.id == fieldId })
        else { return nil }
        guard field.storage == .computed else {
            let stored = item.fieldValues.first { $0.fieldId == fieldId && $0.source == .stored }
            guard case .value(let values)? = stored?.state, let value = values.first else {
                return nil
            }
            return .value(InventoryExpressionValue(value), revision: item.revision)
        }
        return evaluate(field, of: item).flatMap { Self.snapshotField($0, revision: item.revision) }
    }

    private static func snapshotField(_ value: InventoryComputedValue, revision: Int)
        -> InventoryExpressionField?
    {
        switch value.evaluation {
        case .ok(let result):
            return .value(
                InventoryExpressionValue(result), revision: revision,
                dependencies: value.dependencies)
        case .overridden(let result, _):
            return .value(InventoryExpressionValue(result), revision: revision)
        case .unavailable(let reason, let failedFieldId):
            guard let known = InventoryValueUnavailableReason(rawValue: reason) else { return nil }
            let unavailable = InventoryExpressionUnavailable(
                reason: known, failedFieldId: failedFieldId,
                traversedItemIds: value.traversedItemIds)
            return .unavailable(unavailable, revision: revision, dependencies: value.dependencies)
        }
    }

    /// One evaluation's view of the context, rooted at the item that owns the field.
    private struct Snapshot: InventoryExpressionSnapshot {
        let rootItemId: String
        let context: ReplicaExpressionContext

        func item(_ itemId: String) -> InventoryExpressionItemState {
            context.state(of: itemId, root: rootItemId)
        }

        func field(itemId: String, fieldId: String) -> InventoryExpressionField? {
            context.field(itemId: itemId, fieldId: fieldId)
        }
    }
}
