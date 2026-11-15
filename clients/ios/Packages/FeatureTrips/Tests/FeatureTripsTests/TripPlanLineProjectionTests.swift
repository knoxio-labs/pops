import AppCore
import Testing

@testable import FeatureTrips

@Suite("Canonical Plan Line projection")
internal struct TripPlanLineProjectionTests {
    @Test(
        "Mixed root order and repeated place occurrences override source dates and source array order"
    )
    internal func mixedOrder() throws {
        let original = try TripTestSources.snapshot()
        let later = visit(1, arrival: "2026-12-01")
        let earlier = visit(4, arrival: "2026-01-01")
        let detail = snapshot(original, visits: [earlier, later])
        let order: [TripRouteItem] = [.visit(1), .journey(1), .gap(1), .visit(4)]
        let projection = TripPlanLineProjection(route: route(order), snapshot: detail)
        #expect(projection.root.map(\.id) == order.map(TripPlanLineIdentity.root))
        #expect(Set(projection.root.map(\.id)).count == 4)
        guard case .visit(let first, let firstPlace, _) = projection.root[0].content,
            case .visit(let last, let lastPlace, _) = projection.root[3].content
        else {
            Issue.record("Canonical Visits must remain Visit rows")
            return
        }
        #expect(first == later)
        #expect(last == earlier)
        #expect(firstPlace == "Recife")
        #expect(lastPlace == firstPlace)
        #expect(first.timing.arrival == "2026-12-01")
    }

    @Test("Gap paths and members retain producer order including interleaved applied history")
    internal func orderedPaths() throws {
        let detail = try TripTestSources.snapshot()
        let paths = [
            TripRoutePath(
                id: 8, title: "Second alphabetically", gapId: 3, state: .alternative,
                members: [.journey(2), .visit(6)]),
            TripRoutePath(
                id: 5, title: "Applied", gapId: 3, state: .applied,
                members: [.visit(4), .journey(1)]),
            TripRoutePath(
                id: 2, title: "First alphabetically", gapId: 3, state: .alternative, members: []),
        ]
        let projection = TripPlanLineProjection(
            route: route([.visit(4), .gap(3), .journey(1)], paths: paths), snapshot: detail)
        let presented = projection.root[1].paths
        #expect(presented.map(\.id) == [8, 5, 2])
        #expect(presented.map(\.title) == paths.map(\.title))
        #expect(presented.map(\.state) == [.alternative, .applied, .alternative])
        #expect(presented[0].members.map(\.id) == [.path(8, .journey(2)), .path(8, .visit(6))])
        #expect(presented[1].members.map(\.id) == [.path(5, .visit(4)), .path(5, .journey(1))])
        #expect(presented[2].members.isEmpty)
        #expect(projection.root[0].id != presented[1].members[0].id)
        #expect(projection.root[2].id != presented[1].members[1].id)
        #expect(projection.root[0].content == presented[1].members[0].content)
        #expect(projection.root[2].content == presented[1].members[1].content)
        #expect(
            !projection.recorded.contains { $0.content == .source(.journey(detail.journeys[1])) })
    }

    @Test("An empty persisted gap and a valid empty route remain distinct structures")
    internal func emptyStructure() throws {
        let detail = try TripTestSources.snapshot()
        let gap = TripPlanLineProjection(route: route([.gap(4)]), snapshot: detail)
        #expect(gap.root.count == 1)
        #expect(gap.root.first?.content == .gap(4))
        #expect(gap.root.first?.paths.isEmpty == true)
        let empty = TripPlanLineProjection(route: route([]), snapshot: detail)
        #expect(empty.root.isEmpty)
        #expect(
            empty.recorded.map(\.id) == [
                .recordedVisit(4), .recordedSource("stay-2"), .recordedSource("stay-3"),
                .recordedSource("journey-1"), .recordedSource("journey-2"),
            ])
        guard case .visit(_, _, let attached) = empty.recorded[0].content else {
            Issue.record("Unplaced Visit must retain attached source material")
            return
        }
        #expect(attached.map(\.id) == ["stay-1"])
    }

    @Test("Applied history alone does not establish active placement")
    internal func historyIsNotPlacement() throws {
        let detail = try TripTestSources.snapshot()
        let history = TripRoutePath(
            id: 4, title: "Recorded history", gapId: 2, state: .applied,
            members: [.visit(4), .journey(1)])
        let projection = TripPlanLineProjection(
            route: route([.gap(2)], paths: [history]), snapshot: detail)
        #expect(projection.root.map(\.id) == [.root(.gap(2))])
        #expect(projection.recorded.map(\.id).contains(.recordedVisit(4)))
        #expect(projection.recorded.map(\.id).contains(.recordedSource("journey-1")))
        #expect(projection.root[0].paths[0].members[0].id != projection.recorded[0].id)
    }

    @Test("Producer missing references override stale local details in root and history")
    internal func missingWins() throws {
        let detail = try TripTestSources.snapshot()
        let history = TripRoutePath(
            id: 4, title: "History", gapId: 2, state: .applied,
            members: [.journey(1), .visit(4)])
        let projection = TripPlanLineProjection(
            route: route(
                [.visit(4), .journey(1), .gap(2)], paths: [history],
                missing: [.visit(4), .journey(1)]), snapshot: detail)
        #expect(projection.root[0].content == .missing(.visit(4)))
        #expect(projection.root[1].content == .missing(.journey(1)))
        #expect(
            projection.root[2].paths[0].members.map(\.content) == [
                .missing(.journey(1)), .missing(.visit(4)),
            ])
        #expect(!projection.recorded.map(\.id).contains(.recordedVisit(4)))
        #expect(!projection.recorded.map(\.id).contains(.recordedSource("journey-1")))
        #expect(projection.recorded.map(\.id).contains(.recordedSource("stay-1")))
    }

    @Test(
        "Absent local detail is unavailable rather than producer-missing; wrong-trip reads are ignored"
    )
    internal func unavailableDetail() throws {
        let detail = try TripTestSources.snapshot()
        let absent = TripPlanLineProjection(
            route: route([.visit(999), .journey(999)]), snapshot: detail)
        #expect(
            absent.root.map(\.content) == [
                .unavailable(.visit(999)), .unavailable(.journey(999)),
            ])
        let otherTrip = TripRouteSnapshot(
            tripId: 2, revision: 0, order: [.visit(4), .journey(1)], paths: [], missingSources: [])
        let mismatched = TripPlanLineProjection(route: otherTrip, snapshot: detail)
        let unread = TripPlanLineProjection(route: otherTrip, snapshot: nil)
        #expect(mismatched.root == unread.root)
        #expect(mismatched.places.isEmpty)
        #expect(mismatched.recorded.isEmpty)
        #expect(
            mismatched.root.map(\.content) == [
                .unavailable(.visit(4)), .unavailable(.journey(1)),
            ])
    }

    @Test("Missing Place changes only the label, preserving Visit timing and attached sources")
    internal func missingPlace() throws {
        let original = try TripTestSources.snapshot()
        let detail = snapshot(original, places: [])
        let projection = TripPlanLineProjection(route: route([.visit(4)]), snapshot: detail)
        guard case .visit(let visit, let place, let sources) = projection.root[0].content else {
            Issue.record("Missing Place must not replace the Visit")
            return
        }
        #expect(visit == detail.visits[0])
        #expect(place == "Place unavailable")
        #expect(visit.timing.arrival == nil)
        #expect(visit.timing.departure == nil)
        #expect(sources.map(\.id) == ["stay-1"])
        #expect(sources.first?.status == "Reserved")
        #expect(!projection.recorded.map(\.id).contains(.recordedSource("stay-1")))
    }

    private func route(
        _ order: [TripRouteItem], paths: [TripRoutePath] = [], missing: [TripRouteSource] = []
    ) -> TripRouteSnapshot {
        TripRouteSnapshot(
            tripId: 1, revision: 4, order: order, paths: paths, missingSources: missing)
    }

    private func visit(_ id: Int, arrival: String) -> TripVisit {
        TripVisit(
            id: id, tripId: 1, placeId: 1,
            timing: TripVisitTiming(arrival: arrival, departure: nil, month: nil, duration: nil),
            notes: "", sourceLinks: [])
    }

    private func snapshot(
        _ source: TripSnapshot, visits: [TripVisit]? = nil, places: [TripPlace]? = nil
    ) -> TripSnapshot {
        TripSnapshot(
            trip: source.trip, places: places ?? source.places, visits: visits ?? source.visits,
            journeys: source.journeys, journeyGroups: source.journeyGroups, stays: source.stays,
            events: source.events, documentAssociations: source.documentAssociations)
    }
}
