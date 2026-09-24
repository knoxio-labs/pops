import Foundation

/// How one computed field evaluated, on the server or on this phone.
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

/// One computed field's effective value, as evaluated for the item revision
/// `evaluatedItemRevision`: by the server, or by this phone over its own rows
/// (``InventoryComputedDefinition``) when the server's no longer matches them.
public struct InventoryComputedValue: Codable, Hashable, Sendable {
    public let fieldId: String
    public let catalogueRevision: Int
    public let evaluation: InventoryComputedEvaluation
    /// Every item/field revision the evaluation read; empty when overridden.
    public let dependencies: [InventoryValueDependency]
    /// The item itself and every item a reference hop reached; empty when overridden.
    public let traversedItemIds: [String]
    public let evaluatedItemRevision: Int
    /// Every input an unavailable evaluation lacked, field and item for each
    /// (a `coalesce` names each argument's). Empty when available, when the
    /// expression itself failed, and when the value predates the list; the
    /// unavailable evaluation's `failedFieldId` always names one of them.
    public let missingInputs: [InventoryExpressionMissingInput]

    private enum CodingKeys: String, CodingKey {
        case fieldId, catalogueRevision, evaluation, dependencies, traversedItemIds
        case evaluatedItemRevision, missingInputs
    }

    public init(
        fieldId: String, catalogueRevision: Int, evaluation: InventoryComputedEvaluation,
        dependencies: [InventoryValueDependency], traversedItemIds: [String],
        evaluatedItemRevision: Int, missingInputs: [InventoryExpressionMissingInput] = []
    ) {
        self.fieldId = fieldId
        self.catalogueRevision = catalogueRevision
        self.evaluation = evaluation
        self.dependencies = dependencies
        self.traversedItemIds = traversedItemIds
        self.evaluatedItemRevision = evaluatedItemRevision
        self.missingInputs = missingInputs
    }

    /// Decodes a stored value, including one persisted before `missingInputs` existed.
    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        fieldId = try container.decode(String.self, forKey: .fieldId)
        catalogueRevision = try container.decode(Int.self, forKey: .catalogueRevision)
        evaluation = try container.decode(InventoryComputedEvaluation.self, forKey: .evaluation)
        dependencies = try container.decode([InventoryValueDependency].self, forKey: .dependencies)
        traversedItemIds = try container.decode([String].self, forKey: .traversedItemIds)
        evaluatedItemRevision = try container.decode(Int.self, forKey: .evaluatedItemRevision)
        missingInputs =
            try container.decodeIfPresent(
                [InventoryExpressionMissingInput].self, forKey: .missingInputs) ?? []
    }

    /// The server's reason as a known case, or nil for one this build predates.
    public var knownUnavailableReason: InventoryValueUnavailableReason? {
        guard case .unavailable(let reason, _) = evaluation else { return nil }
        return InventoryValueUnavailableReason(rawValue: reason)
    }
}

/// What a computed field shows now, once this phone's own changes are taken
/// into account. It never shows a result the evaluation cannot vouch for.
public enum InventoryComputedDisplay: Hashable, Sendable {
    case value(InventoryPrimitiveValue)
    case overridden(InventoryPrimitiveValue)
    case unavailable(reason: String, failedFieldId: String)
    /// The evaluation read data that has changed since, and the phone could
    /// not evaluate it again: a local edit to the item, a cleared override,
    /// or a newer revision of an item it depends on.
    case outOfDate
}

extension InventoryComputedValue {
    /// Reconciles the server's evaluation with what this phone holds now.
    ///
    /// - Parameters:
    ///   - item: the item carrying this value, as the phone shows it, local
    ///     changes included. An override it holds for the field wins.
    ///   - revisionOf: the revision the phone holds for another item, nil when
    ///     it holds none. Only a revision newer than the one read makes the
    ///     value out of date; an older one means the evaluation is ahead of the
    ///     phone's copy, not behind it.
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
            guard dependency.itemId != item.id, let held = revisionOf(dependency.itemId) else {
                return false
            }
            return held > dependency.revision
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
