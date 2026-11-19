import AppCore
import Foundation
import Testing

@testable import FeatureTrips

@Suite("Today itinerary timeline")
internal struct TripOverviewTimelineTests {
    @Test("visible sources stay under selected route visits in date groups")
    internal func routeTimeline() throws {
        let snapshot = try TripTestSources.snapshot()
        let stay = try #require(snapshot.stays.first { $0.id == 1 })
        let instant = try #require(TripClock.instant(local: "2026-01-02T12:00", zone: "UTC"))
        let route = TripRouteSnapshot(
            tripId: snapshot.trip.id, revision: 1, order: [.visit(4)], paths: [],
            missingSources: [])
        let projection = TripOverviewProjection(
            snapshot: snapshot, at: instant, zone: .gmt, visibleSources: [.stay(stay)],
            visibleVisits: snapshot.visits, route: route)

        #expect(projection.timeline.map(\.id) == ["day-2026-01-01"])
        guard case .visit(let visit) = try #require(projection.timeline.first?.entries.first) else {
            Issue.record("The selected route visit should lead the timeline")
            return
        }
        #expect(visit.visit.id == 4)
        #expect(visit.sources.map(\.id) == ["stay-1"])
    }
}
