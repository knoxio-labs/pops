import AppCore
import Foundation
import Testing

@testable import FeatureTrips

@Suite("Trip overview from recorded sources")
internal struct TripOverviewProjectionTests {
    @Test("Now and Next retain the source projection and a current place requires an association")
    internal func hierarchy() throws {
        let snapshot = try TripTestSources.snapshot()
        let projection = try overview(snapshot, at: "2026-01-02T12:00")
        #expect(projection.heading == .current("Recife"))
        #expect(projection.now.map(\.id) == ["stay-1"])
        #expect(projection.next.map(\.id) == ["stay-2", "journey-1"])
        #expect(projection.chapters.map(\.id) == [4])
        #expect(projection.chapters.first?.isCurrent == true)
        #expect(projection.chapters.first?.timing == "Dates not set")
    }

    @Test("a future countdown identifies the next known source rather than parsing Trip When")
    internal func countdown() throws {
        let snapshot = try TripTestSources.snapshot()
        let projection = try overview(snapshot, at: "2025-12-30T23:59")
        #expect(projection.heading == .upcoming(days: 2, source: "Current stay"))
        #expect(projection.heading.context == "Next · Current stay")
        #expect(snapshot.trip.when == "Summer")
        #expect(projection.now.isEmpty)
    }

    @Test("a later start on this calendar day never becomes a one-day countdown")
    internal func sameDay() throws {
        let projection = try overview(TripTestSources.snapshot(), at: "2026-01-01T09:00")
        #expect(projection.heading == .upcoming(days: 0, source: "Current stay"))
        #expect(projection.heading.title == "Later today")
    }

    @Test("unknown clocks and dates never establish Now, Next, a countdown or a booking state")
    internal func unknownFacts() throws {
        let original = try TripTestSources.snapshot()
        let stay = try #require(original.stays.first { $0.id == 3 })
        let snapshot = subset(original, stays: [stay])
        let projection = try overview(snapshot, at: "2026-01-02T12:00")
        #expect(projection.heading == .recorded("Journey"))
        #expect(projection.now.isEmpty)
        #expect(projection.next.isEmpty)
        #expect(projection.chapters.first?.hasOpenDates == true)
        #expect(projection.chapters.first?.isCurrent == false)
        #expect(stay.status == nil)
        #expect(TripSource.stay(stay).start == nil)
    }

    @Test("Travel day requires a resolved selected journey departure on the display day")
    internal func travelDay() throws {
        let original = try TripTestSources.snapshot()
        let projection = try overview(original, at: "2026-02-01T09:00")
        #expect(projection.heading == .travelDay("Later return"))
        #expect(projection.now.isEmpty)
        #expect(projection.next.map(\.id) == ["journey-1"])
        let alternative = try #require(original.journeys.first { $0.id == 2 })
        #expect(alternative.legs.first?.purchase == "Purchased")
        #expect(!projection.next.map(\.id).contains("journey-2"))
    }

    @Test("a purchased alternative with a departure today cannot become the travel-day heading")
    internal func alternativeDoesNotLead() throws {
        let original = try TripTestSources.snapshot()
        let alternative = try #require(original.journeys.first { $0.id == 2 })
        let activeAlternative = withDeparture(alternative, local: "2026-01-02T14:00")
        let selected = try #require(original.journeys.first { $0.id == 1 })
        let snapshot = TripSnapshot(
            trip: original.trip, places: original.places, visits: original.visits,
            journeys: [activeAlternative, selected], journeyGroups: original.journeyGroups,
            stays: original.stays, events: original.events,
            documentAssociations: original.documentAssociations)
        let projection = try overview(snapshot, at: "2026-01-02T12:00")
        #expect(projection.heading == .current("Recife"))
        #expect(!projection.next.map(\.id).contains("journey-2"))
    }

    @Test("an active Now source leads a selected journey departing later today")
    internal func currentPrecedesUpcomingTravel() throws {
        let original = try TripTestSources.snapshot()
        let journey = try #require(original.journeys.first { $0.id == 1 })
        let upcomingJourney = withDeparture(journey, local: "2026-01-02T14:00")
        let snapshot = TripSnapshot(
            trip: original.trip, places: original.places, visits: original.visits,
            journeys: [upcomingJourney], journeyGroups: [], stays: original.stays,
            events: original.events, documentAssociations: original.documentAssociations)
        let projection = try overview(snapshot, at: "2026-01-02T12:00")
        #expect(projection.heading == .current("Recife"))
        #expect(projection.now.first?.id == "stay-1")
        #expect(projection.next.first?.id == "journey-1")
    }

    @Test("filters constrain the summary instead of leaving a hidden source as the current place")
    internal func filteredOverview() throws {
        let snapshot = try TripTestSources.snapshot()
        let now = try #require(TripClock.instant(local: "2026-01-02T12:00", zone: "UTC"))
        let projection = TripOverviewProjection(
            snapshot: snapshot, at: now, zone: .gmt, visibleSources: [], visibleVisits: [])
        #expect(projection.heading == .recorded("Journey"))
        #expect(projection.now.isEmpty)
        #expect(projection.next.isEmpty)
        #expect(projection.chapters.isEmpty)
    }

    @Test("repeated visits retain order and partial, approximate and reversed dates stay open")
    internal func chapterPrecision() throws {
        let original = try TripTestSources.snapshot()
        let visits = [
            visit(8, arrival: "2026-01-04", departure: "2026-01-02"),
            visit(2, arrival: "2026-01-07", departure: nil),
            TripVisit(
                id: 6, tripId: 1, placeId: 1,
                timing: TripVisitTiming(
                    arrival: nil, departure: nil,
                    month: TripVisitMonth(year: 2026, month: 1, part: "late"), duration: nil),
                notes: "", sourceLinks: []),
        ]
        let projection = try overview(
            subset(original, stays: [], visits: visits), at: "2026-01-01T12:00")
        #expect(projection.chapters.map(\.id) == [8, 2, 6])
        #expect(projection.chapters.map(\.title) == ["Recife", "Recife", "Recife"])
        #expect(projection.chapters.allSatisfy { $0.hasOpenDates })
        #expect(projection.chapters[0].timing.hasPrefix(TripClock.dayLabel("2026-01-04")))
        #expect(projection.chapters[1].timing == "From \(TripClock.dayLabel("2026-01-07"))")
        #expect(projection.chapters[2].timing.contains("late"))
        #expect(projection.chapters[2].timing.contains("2026"))
    }

    @Test("chapter summaries retain independent exact bounds, approximate month and duration")
    internal func independentTimingFacts() {
        let timing = TripVisitTiming(
            arrival: "2026-01-01", departure: "2026-01-05",
            month: TripVisitMonth(year: 2026, month: 1, part: "early"),
            duration: TripVisitDuration(min: 1, max: 2, unit: "weeks"))
        let summary = tripChapterTiming(timing)
        #expect(summary.contains(TripClock.dayLabel("2026-01-01")))
        #expect(summary.contains(TripClock.dayLabel("2026-01-05")))
        #expect(summary.contains("early"))
        #expect(summary.contains("1–2 weeks"))
    }

    private func withDeparture(_ journey: TripJourney, local: String) -> TripJourney {
        let leg = TripJourneyLeg(
            id: 20, journeyId: journey.id, mode: nil,
            from: TripEndpoint(
                placeId: nil, sourceLabel: nil, sourceLinks: nil, local: local, timeZone: "UTC"),
            to: TripEndpoint(
                placeId: nil, sourceLabel: nil, sourceLinks: nil, local: nil, timeZone: nil),
            intention: "Alternative", arrangement: nil, purchase: "Purchased", operator: nil,
            service: nil, reference: nil, notes: "", sourceLinks: [])
        return TripJourney(
            id: journey.id, tripId: journey.tripId, name: journey.name,
            reference: journey.reference, notes: journey.notes, sourceLinks: journey.sourceLinks,
            buffers: journey.buffers, legs: [leg])
    }

    private func overview(_ snapshot: TripSnapshot, at local: String) throws
        -> TripOverviewProjection
    {
        let instant = try #require(TripClock.instant(local: local, zone: "UTC"))
        return TripOverviewProjection(
            snapshot: snapshot, at: instant, zone: .gmt,
            visibleSources: allTripSources(snapshot), visibleVisits: snapshot.visits)
    }

    private func subset(_ source: TripSnapshot, stays: [TripStay], visits: [TripVisit]? = nil)
        -> TripSnapshot
    {
        TripSnapshot(
            trip: source.trip, places: source.places, visits: visits ?? source.visits, journeys: [],
            journeyGroups: [], stays: stays, events: [], documentAssociations: [])
    }

    private func visit(_ id: Int, arrival: String?, departure: String?) -> TripVisit {
        TripVisit(
            id: id, tripId: 1, placeId: 1,
            timing: TripVisitTiming(
                arrival: arrival, departure: departure, month: nil, duration: nil),
            notes: "", sourceLinks: [])
    }
}
