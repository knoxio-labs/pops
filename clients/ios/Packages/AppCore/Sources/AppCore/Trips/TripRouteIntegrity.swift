// The producer's route-schemas.ts requires exact JSON-safe integer identities and revisions.
internal enum TripRouteNumbers {
    static let identities = 1...9_007_199_254_740_991
    static let revisions = 0...identities.upperBound
}

extension TripRouteSnapshot {
    internal var hasValidMembership: Bool {
        guard TripRouteNumbers.identities.contains(tripId),
            TripRouteNumbers.revisions.contains(revision),
            uniqueRouteValues(order), uniqueRouteValues(paths.map(\.id)),
            uniqueRouteValues(missingSources)
        else { return false }
        let gaps = Set(order.filter { $0.source == nil }.map(\.id))
        let active =
            order.compactMap(\.source)
            + paths.filter { $0.state == .alternative }.flatMap(\.members)
        let sources = Set(order.compactMap(\.source) + paths.flatMap(\.members))
        return uniqueRouteValues(active)
            && order.allSatisfy { TripRouteNumbers.identities.contains($0.id) }
            && paths.allSatisfy {
                TripRouteNumbers.identities.contains($0.id) && gaps.contains($0.gapId)
                    && uniqueRouteValues($0.members)
                    && $0.members.allSatisfy { TripRouteNumbers.identities.contains($0.item.id) }
            }
            && missingSources.allSatisfy { sources.contains($0) }
    }
}

private func uniqueRouteValues<Value: Hashable>(_ values: [Value]) -> Bool {
    Set(values).count == values.count
}
