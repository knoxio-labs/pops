import AppCore

/// Fictional canonical route shared by native contract and transport tests; never a production fallback.
public enum TripRouteFixture {
    /// Includes distinct Visit occurrences, missing sources and applied history sharing live identities.
    public static func snapshot() -> TripRouteSnapshot {
        TripRouteSnapshot(
            tripId: 7, revision: 12,
            order: [.visit(22), .journey(40), .gap(71), .visit(21)],
            paths: [
                TripRoutePath(
                    id: 72, title: "A separate path", gapId: 71, state: .alternative,
                    members: [.journey(41), .visit(24)]),
                TripRoutePath(
                    id: 73, title: "Applied history", gapId: 71, state: .applied,
                    members: [.visit(22), .journey(40)]),
            ],
            missingSources: [.visit(24)])
    }
}
