import AppCore
import Foundation
import Testing

@testable import FeatureTrips

@Suite("One Timeline projections")
internal struct TripTimelineFilterTests {
    private let now = Date(timeIntervalSince1970: 1_767_355_200)
    private let zone = TimeZone.gmt

    @Test(
        "the unfiltered timeline retains every original and only explicit selection hides alternatives"
    )
    internal func originals() throws {
        let snapshot = try TripTestSources.snapshot()
        var filter = TripTimelineFilter()
        #expect(filter.sources(in: snapshot, at: now, zone: zone) == allTripSources(snapshot))
        #expect(filter.visits(in: snapshot, sources: allTripSources(snapshot)) == snapshot.visits)
        filter.includeAlternatives = false
        #expect(filter.sources(in: snapshot, at: now, zone: zone) == tripSources(snapshot))
        #expect(snapshot.journeys.count == 2)
    }

    @Test(
        "visit order remains authoritative when dates disagree and ranges filter without clock synthesis"
    )
    internal func visitOrder() throws {
        let source = try TripTestSources.snapshot()
        let original = try #require(source.visits.first)
        let later = TripVisit(
            id: 90, tripId: original.tripId, placeId: original.placeId,
            timing: .init(
                arrival: "2026-01-04", departure: "2026-01-05", month: nil, duration: nil),
            notes: "Later source visit first", sourceLinks: [])
        let earlier = TripVisit(
            id: 7, tripId: original.tripId, placeId: original.placeId,
            timing: .init(
                arrival: "2026-01-01", departure: "2026-01-04", month: nil, duration: nil),
            notes: "Earlier source visit second", sourceLinks: [])
        let snapshot = TripSnapshot(
            trip: source.trip, places: source.places, visits: [later, earlier],
            journeys: [], journeyGroups: [], stays: [], events: [], documentAssociations: [])
        var filter = TripTimelineFilter()
        #expect(filter.visits(in: snapshot, sources: []).map(\.id) == [90, 7])
        filter.fromDay = "2026-01-02"
        filter.throughDay = "2026-01-03"
        #expect(filter.visits(in: snapshot, sources: []).map(\.id) == [7])
    }

    @Test("booking scopes and exact-reference search apply to the same canonical source identity")
    internal func filters() throws {
        let snapshot = try TripTestSources.snapshot()
        let instant = try #require(TripClock.instant(local: "2026-01-03T11:00", zone: "UTC"))
        var filter = TripTimelineFilter()
        filter.scope = .past
        #expect(filter.sources(in: snapshot, at: instant, zone: zone).map(\.id) == ["stay-1"])
        filter.scope = .all
        filter.query = " SOURCE123 "
        #expect(filter.sources(in: snapshot, at: instant, zone: zone).map(\.id) == ["stay-1"])
        filter.query = "absent reference"
        #expect(filter.sources(in: snapshot, at: instant, zone: zone).isEmpty)
    }

    @Test("an inclusive day range retains a spanning interval without manufacturing clocks")
    internal func range() throws {
        let snapshot = try TripTestSources.snapshot()
        var filter = TripTimelineFilter()
        filter.fromDay = "2026-01-02"
        filter.throughDay = "2026-01-02"
        let values = filter.sources(in: snapshot, at: now, zone: zone)
        #expect(values.map(\.id).contains("stay-1"))
        #expect(values.map(\.id).contains("stay-3"))
        #expect(!values.map(\.id).contains("journey-1"))
        let floating = try #require(values.first { $0.id == "stay-3" })
        #expect(floating.start == nil && floating.end == nil)
        #expect(filter.includes(day: "2026-01-02"))
        #expect(!filter.includes(day: "2026-01-03"))
        filter.fromDay = "2026-01-03"
        filter.throughDay = "2026-01-03"
        #expect(filter.sources(in: snapshot, at: now, zone: zone).contains { $0.id == "stay-3" })
        filter.fromDay = "2026-01-02"
        filter.throughDay = "2026-01-01"
        #expect(filter.invalidRange)
        #expect(!filter.includes(day: "2026-01-02"))
        #expect(!filter.includes(try #require(values.first { $0.id == "stay-1" }), zone: zone))
    }

    @Test("calendar facts never manufacture dates for an explicitly included alternative")
    internal func calendarAlternatives() throws {
        let snapshot = try TripTestSources.snapshot()
        let selected = tripCalendarFacts(snapshot, zone: zone)
        let all = tripCalendarFacts(sources: allTripSources(snapshot), zone: zone)
        #expect(!selected.contains { $0.source.id == "journey-2" })
        #expect(!all.contains { $0.source.id == "journey-2" })
        #expect(allTripSources(snapshot).contains { $0.id == "journey-2" })
        #expect(snapshot.visits.map(\.id) == [4])
    }
}
