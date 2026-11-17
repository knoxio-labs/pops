import AppCore
import Foundation
import Testing

@testable import FeatureTrips

@Suite("Canonical Plan calendar")
internal struct TripPlanCalendarProjectionTests {
    @Test(
        "root membership controls dates; alternatives, history and unplaced sources stay separate")
    internal func canonicalMembership() throws {
        let detail = try TripTestSources.snapshot()
        let route = TripRouteSnapshot(
            tripId: 1, revision: 1, order: [.visit(4), .gap(8)],
            paths: [
                TripRoutePath(
                    id: 1, title: "Alternative", gapId: 8, state: .alternative,
                    members: [.journey(1)]),
                TripRoutePath(
                    id: 2, title: "History", gapId: 8, state: .applied,
                    members: [.journey(2), .visit(4)]),
            ], missingSources: [])
        let projection = project(route, detail)
        #expect(projection.entries(on: "2026-02-01").isEmpty)
        #expect(projection.entries(on: "2026-01-04").isEmpty)
        #expect(projection.line.root[1].paths.map(\.state) == [.alternative, .applied])
        #expect(projection.line.recorded.map(\.id).contains(.recordedSource("stay-2")))
        #expect(projection.line.recorded.map(\.id).contains(.recordedSource("journey-2")))
        #expect(projection.entries(on: "2026-01-02").map(\.id) == ["stay-1"])
        #expect(projection.recordedDays == ["2026-01-01", "2026-01-03"])
    }

    @Test("stay spans cross months and exclude checkout; check-out remains an explicit endpoint")
    internal func stayBoundaries() throws {
        let original = try TripTestSources.snapshot()
        let stay = stay(arrival: "2028-02-28", departure: "2028-03-02")
        let projection = project(route([.visit(4)]), snapshot(original, stays: [stay]))
        #expect(projection.entries(on: "2028-02-27").isEmpty)
        #expect(projection.entries(on: "2028-02-28").first?.labels == ["Check-in"])
        #expect(projection.entries(on: "2028-02-29").first?.labels == ["Stay continues"])
        #expect(projection.entries(on: "2028-03-01").first?.labels == ["Stay continues"])
        #expect(projection.entries(on: "2028-03-02").first?.labels == ["Check-out"])
        #expect(projection.entries(on: "2028-03-03").isEmpty)
        #expect(projection.staySpans(in: ["2028-02-29", "2028-03-01"]).map(\.stay) == [stay])
        #expect(projection.staySpans(in: ["2028-03-02"]).isEmpty)
    }

    @Test("reversed and partial bounds retain endpoints without manufacturing occupied days")
    internal func invalidIntervals() throws {
        let original = try TripTestSources.snapshot()
        let reversed = stay(arrival: "2028-03-05", departure: "2028-03-01")
        let projection = project(route([.visit(4)]), snapshot(original, stays: [reversed]))
        #expect(projection.entries(on: "2028-03-03").isEmpty)
        #expect(projection.entries(on: "2028-03-05").first?.labels == ["Check-in"])
        #expect(projection.entries(on: "2028-03-01").first?.labels == ["Check-out"])
        #expect(projection.staySpans(in: ["2028-03-03"]).isEmpty)
        #expect(projection.unallocated.map(\.id) == [.root(.visit(4))])
        #expect(projection.entries(on: "2028-02-30").isEmpty)
    }

    @Test(
        "approximate Visit timing stays unallocated while exact independent boundaries remain visible"
    )
    internal func visitPrecision() throws {
        let original = try TripTestSources.snapshot()
        let timing = TripVisitTiming(
            arrival: "2028-03-08", departure: nil,
            month: TripVisitMonth(year: 2028, month: 3, part: "late"),
            duration: TripVisitDuration(min: 1.5, max: 2, unit: "weeks"))
        let visit = TripVisit(
            id: 4, tripId: 1, placeId: 1, timing: timing, notes: "Original", sourceLinks: [])
        let projection = project(route([.visit(4)]), snapshot(original, visits: [visit], stays: []))
        #expect(projection.recordedDays == ["2028-03-08"])
        #expect(projection.entries(on: "2028-03-08").first?.labels == ["Visit arrival"])
        #expect(projection.entries(on: "2028-03-09").isEmpty)
        let unallocated = try #require(projection.unallocated.first)
        guard case .visit(let retained, _, _) = unallocated.content else {
            Issue.record("Partial Visit must remain available outside allocated days")
            return
        }
        #expect(retained.timing == timing)
        #expect(retained.notes == "Original")
    }

    @Test(
        "producer missing references suppress stale facts; wrong-trip detail never supplies dates")
    internal func ownershipAndMissing() throws {
        let original = try TripTestSources.snapshot()
        let missing = TripRouteSnapshot(
            tripId: 1, revision: 1, order: [.visit(4), .journey(1)], paths: [],
            missingSources: [.visit(4), .journey(1)])
        let projection = project(missing, original)
        #expect(projection.recordedDays.isEmpty)
        #expect(projection.entries(on: "2026-01-01").isEmpty)
        #expect(
            projection.unallocated.map(\.content) == [.missing(.visit(4)), .missing(.journey(1))])
        let foreign = TripRouteSnapshot(
            tripId: 2, revision: 1, order: [.visit(4), .journey(1)], paths: [], missingSources: [])
        let wrongOwner = project(foreign, original)
        #expect(wrongOwner.recordedDays.isEmpty)
        #expect(wrongOwner.line.recorded.isEmpty)
        #expect(
            wrongOwner.unallocated.map(\.content) == [
                .unavailable(.visit(4)), .unavailable(.journey(1)),
            ])
        let unread = project(route([.gap(4), .visit(4)]), nil)
        #expect(unread.recordedDays.isEmpty)
        #expect(unread.unallocated.map(\.content) == [.gap(4), .unavailable(.visit(4))])
    }

    @Test("same-day endpoint labels share one source row without discarding either fact")
    internal func sameDayFacts() throws {
        let original = try TripTestSources.snapshot()
        let stay = stay(arrival: "2028-03-01", departure: "2028-03-01")
        let projection = project(route([.visit(4)]), snapshot(original, stays: [stay]))
        let entries = projection.entries(on: "2028-03-01")
        #expect(entries.count == 1)
        #expect(Set(entries[0].labels) == ["Check-in", "Check-out"])
        #expect(projection.staySpans(in: ["2028-03-01"]).isEmpty)
        guard case .source(.stay(let retained)) = entries[0].item.content else {
            Issue.record("Calendar must keep the actual source")
            return
        }
        #expect(retained == stay)
    }

    @Test("complete same-day Visits and Stays are fully dated without overnight occupancy")
    internal func sameDayCompleteness() throws {
        let original = try TripTestSources.snapshot()
        let visit = TripVisit(
            id: 4, tripId: 1, placeId: 1,
            timing: TripVisitTiming(
                arrival: "2028-03-01", departure: "2028-03-01", month: nil, duration: nil),
            notes: "", sourceLinks: [])
        let projection = project(
            route([.visit(4)]),
            snapshot(
                original, visits: [visit],
                stays: [stay(arrival: "2028-03-01", departure: "2028-03-01")]))
        #expect(projection.unallocated.isEmpty)
        #expect(projection.staySpans(in: ["2028-03-01"]).isEmpty)
        #expect(
            projection.entries(on: "2028-03-01").map(\.labels) == [
                ["Visit arrival", "Visit departure"], ["Check-in", "Check-out"],
            ])
    }

    @Test("resolved stay endpoints and bands share the display-zone day basis")
    internal func zonedStay() throws {
        let original = try TripTestSources.snapshot()
        let zoned = TripStay(
            id: 1, tripId: 1, visitId: 4, name: "Recorded stay", kind: nil, status: nil,
            timing: TripStayTiming(
                arrival: "2028-03-01", departure: "2028-03-03", checkIn: "01:00", checkOut: "01:00",
                timeZone: "UTC"),
            address: nil, reference: nil, notes: "", sourceLinks: [], hostLinks: [],
            documentLinks: [])
        let projection = TripPlanCalendarProjection(
            route: route([.visit(4)]), snapshot: snapshot(original, stays: [zoned]),
            zone: try #require(TimeZone(identifier: "Pacific/Honolulu")))
        let span = try #require(projection.staySpans(in: ["2028-02-29"]).first)
        #expect(span.arrivalDay == "2028-02-29")
        #expect(span.departureDay == "2028-03-02")
        #expect(projection.entries(on: "2028-03-01").first?.labels == ["Stay continues"])
        #expect(projection.entries(on: "2028-03-02").first?.labels == ["Check-out"])
        #expect(projection.staySpans(in: ["2028-03-02"]).isEmpty)
        let floating = TripPlanCalendarProjection(
            route: route([.visit(4)]),
            snapshot: snapshot(
                original, stays: [stay(arrival: "2028-03-01", departure: "2028-03-03")]),
            zone: try #require(TimeZone(identifier: "Pacific/Honolulu")))
        #expect(floating.staySpans(in: ["2028-03-01"]).first?.arrivalDay == "2028-03-01")
        #expect(floating.entries(on: "2028-03-03").first?.labels == ["Check-out"])
    }

    @Test("empty canonical root does not promote separately recorded sources into dated plans")
    internal func emptyRoute() throws {
        let projection = project(route([]), try TripTestSources.snapshot())
        #expect(projection.recordedDays.isEmpty)
        #expect(projection.entries(on: "2026-01-01").isEmpty)
        #expect(!projection.line.recorded.isEmpty)
    }

    private func route(_ order: [TripRouteItem]) -> TripRouteSnapshot {
        TripRouteSnapshot(tripId: 1, revision: 1, order: order, paths: [], missingSources: [])
    }

    private func project(_ route: TripRouteSnapshot, _ snapshot: TripSnapshot?)
        -> TripPlanCalendarProjection
    {
        TripPlanCalendarProjection(route: route, snapshot: snapshot, zone: .gmt)
    }

    private func stay(arrival: String?, departure: String?) -> TripStay {
        TripStay(
            id: 1, tripId: 1, visitId: 4, name: "Recorded stay", kind: .none, status: "Reserved",
            timing: TripStayTiming(
                arrival: arrival, departure: departure, checkIn: nil, checkOut: nil, timeZone: nil),
            address: "Original address", reference: "Original reference", notes: "Original notes",
            sourceLinks: [], hostLinks: [], documentLinks: [])
    }

    private func snapshot(
        _ source: TripSnapshot, visits: [TripVisit]? = nil, stays: [TripStay]
    ) -> TripSnapshot {
        TripSnapshot(
            trip: source.trip, places: source.places, visits: visits ?? source.visits,
            journeys: [], journeyGroups: [], stays: stays, events: [], documentAssociations: [])
    }
}
