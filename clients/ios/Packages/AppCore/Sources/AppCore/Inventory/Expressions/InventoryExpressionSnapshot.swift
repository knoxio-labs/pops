import Foundation

/// How a snapshot knows one item a read reaches. Only `resolved`, at the
/// revision the snapshot holds, is readable; the others become
/// `reference_unresolved`, `reference_missing` and `reference_deleted`
/// (ADR-002 D5).
public enum InventoryExpressionItemState: Hashable, Sendable {
    case resolved(revision: Int)
    case unresolved
    case missing
    case deleted
}

/// Why a read produced no value: the reason, the field that failed, and the
/// items the read had reached.
public struct InventoryExpressionUnavailable: Hashable, Sendable {
    public let reason: InventoryValueUnavailableReason
    public let failedFieldId: String
    public let traversedItemIds: [String]

    public init(
        reason: InventoryValueUnavailableReason, failedFieldId: String, traversedItemIds: [String]
    ) {
        self.reason = reason
        self.failedFieldId = failedFieldId
        self.traversedItemIds = traversedItemIds
    }
}

/// One field a snapshot holds. A computed field carries the dependencies of
/// its own evaluation, which a read of it inherits.
public enum InventoryExpressionField: Hashable, Sendable {
    case value(
        InventoryExpressionValue, revision: Int, dependencies: [InventoryValueDependency] = [])
    case unavailable(
        InventoryExpressionUnavailable, revision: Int, dependencies: [InventoryValueDependency] = []
    )
}

/// The synchronous, immutable view one evaluation reads. The server's
/// `ExpressionSnapshot`: `rootItemId` is the item that owns the computed
/// field, and `field` answers nil for a field the item has no value for.
public protocol InventoryExpressionSnapshot {
    var rootItemId: String { get }
    func item(_ itemId: String) -> InventoryExpressionItemState
    func field(itemId: String, fieldId: String) -> InventoryExpressionField?
}

/// The outcome of evaluating an expression: a value, an unavailable input, or
/// an evaluation failure, each with the item/field revisions it read.
public enum InventoryExpressionEvaluation<Value: Hashable & Sendable>: Hashable, Sendable {
    case value(Value, dependencies: [InventoryValueDependency])
    case unavailable(InventoryExpressionUnavailable, dependencies: [InventoryValueDependency])
    case error(InventoryExpressionErrorCode, dependencies: [InventoryValueDependency])

    /// Every item/field revision the evaluation read, unique and ordered by item then field.
    public var dependencies: [InventoryValueDependency] {
        switch self {
        case .value(_, let dependencies), .unavailable(_, let dependencies),
            .error(_, let dependencies):
            return dependencies
        }
    }

    func merging(_ earlier: [InventoryValueDependency]) -> Self {
        let merged = InventoryValueDependency.unique(earlier + dependencies)
        switch self {
        case .value(let value, _): return .value(value, dependencies: merged)
        case .unavailable(let unavailable, _):
            return .unavailable(unavailable, dependencies: merged)
        case .error(let code, _): return .error(code, dependencies: merged)
        }
    }
}

extension InventoryValueDependency {
    /// One entry per item and field, the last read winning, ordered by
    /// `itemId:fieldId` as the server's `uniqueEvaluatedDependencies` orders them.
    static func unique(_ dependencies: [InventoryValueDependency]) -> [InventoryValueDependency] {
        var byKey: [String: InventoryValueDependency] = [:]
        for dependency in dependencies {
            byKey["\(dependency.itemId):\(dependency.fieldId)"] = dependency
        }
        return byKey.sorted { $0.key < $1.key }.map(\.value)
    }
}
