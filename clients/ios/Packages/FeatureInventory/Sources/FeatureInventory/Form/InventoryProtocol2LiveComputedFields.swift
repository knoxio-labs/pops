import AppCore

/// Presents the item form's draft as an ``InventoryExpressionSnapshot``, so a
/// computed field can be evaluated against values that have not reached the
/// server yet. The root is the draft itself: reading one of its own fields
/// answers straight from `values`. A reference field's read instead follows
/// the id it names into the replica (`source`), the same live record every
/// other draft the form could open would answer with, never another draft.
internal struct InventoryProtocol2DraftSnapshot: InventoryExpressionSnapshot {
    internal let rootItemId: String
    private let rootRevision: Int
    private let values: [String: [InventoryPrimitiveValue]]
    private let source: any InventoryQuerySource

    internal init(
        rootItemId: String, rootRevision: Int, type: InventoryCatalogueType,
        draft: InventoryProtocol2Draft, source: any InventoryQuerySource
    ) {
        self.rootItemId = rootItemId
        self.rootRevision = rootRevision
        self.source = source
        values = Dictionary(
            uniqueKeysWithValues: type.fields.filter { $0.storage == .stored }.map {
                ($0.id, draft.values(for: $0))
            })
    }

    internal func item(_ itemId: String) -> InventoryExpressionItemState {
        if itemId == rootItemId { return .resolved(revision: rootRevision) }
        if let item = source.inventoryItem(id: itemId) {
            return item.isDeleted ? .deleted : .resolved(revision: item.revision)
        }
        if let location = source.inventoryLocation(id: itemId) {
            return location.deletedAt != nil ? .deleted : .resolved(revision: location.revision)
        }
        return .missing
    }

    internal func field(itemId: String, fieldId: String) -> InventoryExpressionField? {
        guard itemId != rootItemId else {
            guard let value = values[fieldId]?.first else { return nil }
            return .value(InventoryExpressionValue(value), revision: rootRevision)
        }
        guard let item = source.inventoryItem(id: itemId) else { return nil }
        return Self.field(fieldId, of: item)
    }

    /// A referenced item's own effective field: its stored value, or, when
    /// the field is itself computed on that item, the server's evaluation of
    /// it (reconciliation with this phone's own changes is not attempted:
    /// the reference is read-only from here, and the server's evaluation is
    /// the best answer this phone can give without recursing into another
    /// item's own draft, which does not exist).
    private static func field(_ fieldId: String, of item: InventoryItem)
        -> InventoryExpressionField?
    {
        if let computed = item.computedValues.first(where: { $0.fieldId == fieldId }) {
            switch computed.evaluation {
            case .ok(let value):
                return .value(InventoryExpressionValue(value), revision: item.revision)
            case .overridden(let value, _):
                return .value(InventoryExpressionValue(value), revision: item.revision)
            case .unavailable(let reason, let failedFieldId):
                let known = InventoryValueUnavailableReason(rawValue: reason) ?? .evaluationError
                return .unavailable(
                    InventoryExpressionUnavailable(
                        reason: known, failedFieldId: failedFieldId,
                        traversedItemIds: computed.traversedItemIds,
                        missingInputs: computed.missingInputs), revision: item.revision)
            }
        }
        guard let entry = item.fieldValues.first(where: { $0.fieldId == fieldId }),
            case .value(let stored) = entry.state, let value = stored.first
        else { return nil }
        return .value(InventoryExpressionValue(value), revision: item.revision)
    }
}

/// Recomputes each computed field's display straight from the item form's
/// current draft, the way `InventoryComputedDefinition` evaluates on the
/// server (ADR-002 D11, POPS-4836) — so a row moves as soon as its inputs do,
/// in create and in edit, rather than waiting for a round trip.
internal enum InventoryProtocol2LiveComputedFields {
    /// What one recomputation needs: the type and draft to evaluate, the
    /// draft's identity as the expression's root, which fields an override
    /// already fixes, and the catalogue and replica an expression's reads
    /// resolve against.
    internal struct Input {
        internal let type: InventoryCatalogueType
        internal let draft: InventoryProtocol2Draft
        internal let rootItemId: String
        internal let rootRevision: Int
        internal let rootName: String
        internal let overriddenFieldIds: Set<String>
        internal let fieldKinds: [String: InventoryPrimitiveKind]
        internal let source: any InventoryQuerySource
    }

    internal struct Result {
        internal var displays: [String: InventoryComputedDisplay] = [:]
        /// Present only for a field this pass left `.unavailable`.
        internal var missingInputs: [String: [InventoryMissingInput]] = [:]
    }

    /// One entry per computed field this build can parse and that is not
    /// currently overridden; a field left out of `overriddenFieldIds` but
    /// whose expression fails to parse is left out of the result too, so the
    /// caller keeps showing whatever it already had for it.
    internal static func evaluate(_ input: Input) -> Result {
        let snapshot = InventoryProtocol2DraftSnapshot(
            rootItemId: input.rootItemId, rootRevision: input.rootRevision, type: input.type,
            draft: input.draft, source: input.source)
        var result = Result()
        for field in input.type.fields
        where field.storage == .computed && !input.overriddenFieldIds.contains(field.id) {
            guard
                let definition = try? InventoryComputedDefinition(
                    field, fieldKinds: input.fieldKinds),
                let value = try? definition.evaluate(
                    override: nil, catalogueRevision: input.draft.catalogueRevision,
                    itemRevision: input.rootRevision, in: snapshot)
            else { continue }
            switch value.evaluation {
            case .ok(let primitive), .overridden(let primitive, _):
                result.displays[field.id] = .value(primitive)
            case .unavailable(let reason, let failedFieldId):
                result.displays[field.id] = .unavailable(
                    reason: reason, failedFieldId: failedFieldId)
                result.missingInputs[field.id] = InventoryMissingInputs.named(
                    value, rootItemId: input.rootItemId, rootName: input.rootName,
                    fields: input.type.fields
                ) { input.source.inventoryItem(id: $0)?.name }
            }
        }
        return result
    }
}
