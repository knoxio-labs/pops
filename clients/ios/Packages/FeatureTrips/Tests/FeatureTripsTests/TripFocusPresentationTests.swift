import AppCore
import Foundation
import Testing

@testable import FeatureTrips

@Suite("Operational trip focus")
internal struct TripFocusPresentationTests {
    @Test("active Now and earliest Next precede chapters without losing later sources")
    internal func activeFocus() throws {
        let snapshot = try TripTestSources.snapshot()
        let value = try overview(snapshot, at: "2026-01-02T12:00")
        #expect(value.chaptersFollowFocus)
        #expect(value.now.map(\.id) == ["stay-1"])
        #expect(value.nextFocus.map(\.id) == ["stay-2"])
        #expect(value.next.map(\.id) == ["stay-2", "journey-1"])
        #expect(allTripSources(snapshot).contains { $0.id == "journey-1" })
    }

    @Test("before-trip overview retains its chapter rail near the countdown")
    internal func beforeTrip() throws {
        let value = try overview(TripTestSources.snapshot(), at: "2025-12-30T12:00")
        #expect(!value.chaptersFollowFocus)
        #expect(value.now.isEmpty)
        #expect(value.nextFocus.map(\.id) == ["stay-1"])
        #expect(value.heading == .upcoming(days: 2, source: "Current stay"))
    }

    @Test("a recorded travel day prioritizes practical focus even before its departure")
    internal func travelDay() throws {
        let value = try overview(TripTestSources.snapshot(), at: "2026-02-01T09:00")
        #expect(value.chaptersFollowFocus)
        #expect(value.now.isEmpty)
        #expect(value.nextFocus.map(\.id) == ["journey-1"])
    }

    @Test("Next retains every source tied at the earliest start")
    internal func tiedStarts() throws {
        let original = try TripTestSources.snapshot()
        let source = try #require(original.stays.first { $0.id == 2 })
        let tied = TripStay(
            id: 9, tripId: source.tripId, visitId: nil, name: "Simultaneous source", kind: nil,
            status: nil, timing: source.timing, address: nil, reference: nil, notes: "",
            sourceLinks: [], hostLinks: [], documentLinks: [])
        let snapshot = TripSnapshot(
            trip: original.trip, places: original.places, visits: original.visits,
            journeys: original.journeys, journeyGroups: original.journeyGroups,
            stays: original.stays + [tied], events: original.events,
            documentAssociations: original.documentAssociations)
        let value = try overview(snapshot, at: "2026-01-02T12:00")
        #expect(value.nextFocus.map(\.id) == ["stay-2", "stay-9"])
        #expect(value.next.map(\.id).contains("journey-1"))
    }

    @Test("compact Next retains exact named source, clock, zone and independent departure states")
    internal func nextFacts() throws {
        let snapshot = try TripTestSources.snapshot()
        let journey = try #require(snapshot.journeys.first { $0.id == 1 })
        let source = TripSource.journey(journey)
        let summary = TripNextSummary(source: source, places: snapshot.places, zone: .gmt)
        let start = try #require(source.start)
        #expect(summary.title == "Later return")
        #expect(summary.when.contains(TripClock.dateLabel(start, zone: .gmt)))
        #expect(summary.when.contains(TripClock.clockLabel(start, zone: .gmt)))
        #expect(summary.when.contains(TimeZone.gmt.identifier))
        #expect(
            summary.timing == [
                TripClock.dateLabel(start, zone: .gmt), TripClock.clockLabel(start, zone: .gmt),
                TimeZone.gmt.identifier,
            ])
        #expect(summary.states == ["In plan", "Booked"])
        #expect(summary.stateScope == nil)
        #expect(!summary.states.contains("Purchased"))
    }

    @Test("a missing source clock or state remains unknown in the compact summary")
    internal func unknownSummary() throws {
        let snapshot = try TripTestSources.snapshot()
        let stay = try #require(snapshot.stays.first { $0.id == 3 })
        let summary = TripNextSummary(source: .stay(stay), places: snapshot.places, zone: .gmt)
        #expect(summary.when.contains(TripClock.dayLabel("2026-01-02")))
        #expect(summary.when.contains("Time not set"))
        #expect(!summary.when.contains(TimeZone.gmt.identifier))
        #expect(!summary.timing.contains(TimeZone.gmt.identifier))
        #expect(summary.states.isEmpty)
        #expect(summary.stateLine == nil)
    }

    @Test("multi-leg state is scoped to departure instead of asserting one state for all legs")
    internal func multiLegState() throws {
        let snapshot = try TripTestSources.snapshot()
        let journey = try #require(snapshot.journeys.first { $0.id == 1 })
        let first = try #require(journey.legs.first)
        let second = TripJourneyLeg(
            id: 11, journeyId: journey.id, mode: nil, from: first.to, to: first.from,
            intention: "Alternative", arrangement: "Cancelled", purchase: "Purchased",
            operator: nil,
            service: nil, reference: nil, notes: "", sourceLinks: [])
        let multiple = TripJourney(
            id: journey.id, tripId: journey.tripId, name: journey.name, reference: nil, notes: "",
            sourceLinks: [], buffers: journey.buffers, legs: [first, second])
        let summary = TripNextSummary(
            source: .journey(multiple), places: snapshot.places, zone: .gmt)
        #expect(summary.stateScope == "Departure")
        #expect(summary.states == ["In plan", "Booked"])
        #expect(summary.stateLine == "Departure · In plan · Booked")
        #expect(summary.hasConflictingTimes)
    }

    private func overview(_ snapshot: TripSnapshot, at local: String) throws
        -> TripOverviewProjection
    {
        let instant = try #require(TripClock.instant(local: local, zone: "UTC"))
        return TripOverviewProjection(
            snapshot: snapshot, at: instant, zone: .gmt,
            visibleSources: allTripSources(snapshot), visibleVisits: snapshot.visits)
    }
}
