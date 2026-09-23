import Foundation

/// How the server evaluated one computed field.
public enum InventoryComputedEvaluation: Codable, Hashable, Sendable {
    /// The expression's value.
    case ok(InventoryPrimitiveValue)
    /// An explicit override supersedes the expression, which was not
    /// evaluated. `overrideCatalogueRevision` is the revision it was written
    /// against.
    case overridden(InventoryPrimitiveValue, overrideCatalogueRevision: Int)
    /// The expression produced no value. `reason` is kept verbatim because
    /// the server may add causes without a protocol bump (ADR-002 D10);
    /// `failedFieldId` is the dependency that was missing, or the computed
    /// field itself when evaluation failed.
    case unavailable(reason: String, failedFieldId: String)
}

/// One computed field's effective value, as the server evaluated it for the
/// item revision `evaluatedItemRevision`.
public struct InventoryComputedValue: Codable, Hashable, Sendable {
    public let fieldId: String
    public let catalogueRevision: Int
    public let evaluation: InventoryComputedEvaluation
    /// Every item/field revision the evaluation read; empty when overridden.
    public let dependencies: [InventoryValueDependency]
    /// The item itself and every item a reference hop reached; empty when overridden.
    public let traversedItemIds: [String]
    public let evaluatedItemRevision: Int

    public init(
        fieldId: String, catalogueRevision: Int, evaluation: InventoryComputedEvaluation,
        dependencies: [InventoryValueDependency], traversedItemIds: [String],
        evaluatedItemRevision: Int
    ) {
        self.fieldId = fieldId
        self.catalogueRevision = catalogueRevision
        self.evaluation = evaluation
        self.dependencies = dependencies
        self.traversedItemIds = traversedItemIds
        self.evaluatedItemRevision = evaluatedItemRevision
    }

    /// The server's reason as a known case, or nil for one this build predates.
    public var knownUnavailableReason: InventoryValueUnavailableReason? {
        guard case .unavailable(let reason, _) = evaluation else { return nil }
        return InventoryValueUnavailableReason(rawValue: reason)
    }
}

/// What a computed field shows now, once this phone's own changes are taken
/// into account. The phone never evaluates an expression, so it never shows
/// a result it cannot vouch for.
public enum InventoryComputedDisplay: Hashable, Sendable {
    case value(InventoryPrimitiveValue)
    case overridden(InventoryPrimitiveValue)
    case unavailable(reason: String, failedFieldId: String)
    /// The evaluation read data that has changed since: a local edit to the
    /// item, a cleared override, or a newer revision of an item it depends on.
    case outOfDate
}

extension InventoryComputedValue {
    /// Reconciles the server's evaluation with what this phone holds now.
    ///
    /// - Parameters:
    ///   - item: the item carrying this value, as the phone shows it, local
    ///     changes included. An override it holds for the field wins.
    ///   - revisionOf: the revision the phone holds for another item, nil when
    ///     it holds none.
    public func display(in item: InventoryItem, revisionOf: (String) -> Int?)
        -> InventoryComputedDisplay
    {
        let localOverride = item.fieldValues.first {
            $0.fieldId == fieldId && $0.source == .override
        }
        if case .value(let values)? = localOverride?.state, let value = values.first {
            return .overridden(value)
        }
        if case .overridden = evaluation { return .outOfDate }
        guard item.revision == evaluatedItemRevision else { return .outOfDate }
        let otherDependencyChanged = dependencies.contains { dependency in
            dependency.itemId != item.id && revisionOf(dependency.itemId) != dependency.revision
        }
        if otherDependencyChanged { return .outOfDate }
        switch evaluation {
        case .ok(let value): return .value(value)
        case .unavailable(let reason, let failedFieldId):
            return .unavailable(reason: reason, failedFieldId: failedFieldId)
        case .overridden: return .outOfDate
        }
    }
}
