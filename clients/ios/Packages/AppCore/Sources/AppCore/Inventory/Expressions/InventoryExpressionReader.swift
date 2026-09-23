import Foundation

/// `expression-reader.ts`: follows a read's reference path from the root
/// item, recording every field it reads, and stops at the first item or
/// field that is not there.
internal struct InventoryExpressionReader {
    typealias Raw = InventoryExpressionEvaluation<InventoryExpressionValue>

    let snapshot: any InventoryExpressionSnapshot

    func read(_ path: [String], _ fieldId: String) -> Raw {
        var itemId = snapshot.rootItemId
        var traversed = [itemId]
        var dependencies: [InventoryValueDependency] = []
        for referenceFieldId in path {
            switch step(itemId, referenceFieldId, traversed, &dependencies) {
            case .success(let value):
                guard case .reference(.item, let targetId) = value else {
                    return .error(
                        .invalidValue, dependencies: InventoryValueDependency.unique(dependencies))
                }
                itemId = targetId
                traversed.append(targetId)
            case .failure(let stopped): return stopped.evaluation
            }
        }
        switch step(itemId, fieldId, traversed, &dependencies) {
        case .success(let value):
            return .value(value, dependencies: InventoryValueDependency.unique(dependencies))
        case .failure(let stopped): return stopped.evaluation
        }
    }

    private func step(
        _ itemId: String, _ fieldId: String, _ traversed: [String],
        _ dependencies: inout [InventoryValueDependency]
    ) -> Result<InventoryExpressionValue, Stopped> {
        if let reason = Self.reason(for: snapshot.item(itemId)) {
            return .failure(Stopped(unavailable(reason, fieldId, traversed, dependencies)))
        }
        guard let field = snapshot.field(itemId: itemId, fieldId: fieldId) else {
            return .failure(
                Stopped(unavailable(.missingDependency, fieldId, traversed, dependencies)))
        }
        switch field {
        case .value(let value, let revision, let inherited):
            dependencies.append(
                InventoryValueDependency(itemId: itemId, fieldId: fieldId, revision: revision))
            dependencies.append(contentsOf: inherited)
            return .success(value)
        case .unavailable(let failure, let revision, let inherited):
            dependencies.append(
                InventoryValueDependency(itemId: itemId, fieldId: fieldId, revision: revision))
            dependencies.append(contentsOf: inherited)
            return .failure(
                Stopped(
                    unavailable(
                        failure.reason, failure.failedFieldId, failure.traversedItemIds,
                        dependencies)))
        }
    }

    private func unavailable(
        _ reason: InventoryValueUnavailableReason, _ fieldId: String, _ traversed: [String],
        _ dependencies: [InventoryValueDependency]
    ) -> Raw {
        .unavailable(
            InventoryExpressionUnavailable(
                reason: reason, failedFieldId: fieldId, traversedItemIds: traversed),
            dependencies: InventoryValueDependency.unique(dependencies))
    }

    private static func reason(for state: InventoryExpressionItemState)
        -> InventoryValueUnavailableReason?
    {
        switch state {
        case .resolved: return nil
        case .unresolved: return .referenceUnresolved
        case .missing: return .referenceMissing
        case .deleted: return .referenceDeleted
        }
    }

    /// A read that ended without a value, carried through `Result`.
    struct Stopped: Error {
        let evaluation: Raw

        init(_ evaluation: Raw) { self.evaluation = evaluation }
    }
}
