import Foundation

extension InventoryExpressionEvaluator {
    /// `expression-coalesce.ts`: the first argument that has a value. An
    /// unavailable argument is skipped, and the input it lacked is recorded as
    /// a dependency (at revision 0 when its item is not there) so the value
    /// goes stale when that input appears; an evaluation error is not skipped.
    /// With every argument unavailable, the last one's reason and failing
    /// field stand, and the items every argument reached are traversed.
    func coalesce(_ values: [InventoryExpression]) -> Raw {
        var dependencies: [InventoryValueDependency] = []
        var traversed: [String] = []
        var last: InventoryExpressionUnavailable?
        for value in values {
            let evaluated = node(value)
            dependencies += evaluated.dependencies
            guard case .unavailable(let unavailable, _) = evaluated else {
                return evaluated.replacingDependencies(
                    InventoryValueDependency.unique(dependencies))
            }
            dependencies.append(absence(unavailable))
            for itemId in unavailable.traversedItemIds where !traversed.contains(itemId) {
                traversed.append(itemId)
            }
            last = unavailable
        }
        guard let last else { return .error(.invalidValue, dependencies: []) }
        return .unavailable(
            InventoryExpressionUnavailable(
                reason: last.reason, failedFieldId: last.failedFieldId, traversedItemIds: traversed),
            dependencies: InventoryValueDependency.unique(dependencies))
    }

    private func absence(_ skipped: InventoryExpressionUnavailable) -> InventoryValueDependency {
        let itemId = skipped.traversedItemIds.last ?? snapshot.rootItemId
        var revision = 0
        if case .resolved(let held) = snapshot.item(itemId) { revision = held }
        return InventoryValueDependency(
            itemId: itemId, fieldId: skipped.failedFieldId, revision: revision)
    }
}
