import AppCore
import Foundation
import Testing

@testable import FeatureTrips

@Suite("Canonical event source projection")
internal struct TripEventProjectionTests {
    @Test("a future event precedes a later journey without selecting participation or purchase")
    internal func futureChronology() throws {
        let event = event(
            timing: .init(
                start: "2026-01-02", end: "2026-01-02", startTime: "14:00", endTime: "16:00",
                timeZone: "UTC"), intention: "Alternative")
        let source = try snapshot([event])
        let now = try #require(TripClock.instant(local: "2026-01-02T12:00", zone: "UTC"))
        let projection = TripTodayProjection(snapshot: source, at: now)
        #expect(projection.now.map(\.id) == ["stay-1"])
        #expect(projection.next.map(\.id) == ["event-7", "stay-2", "journey-1"])
        #expect(tripSources(source).contains(.event(event)))
        #expect(event.intention == "Alternative")
        #expect(event.arrangement == "Not arranged")
        #expect(event.purchase == "Purchased")
    }

    @Test("event intervals are half-open and future ends never synthesize an unknown start")
    internal func boundaries() throws {
        let event = event(
            timing: .init(
                start: "2026-01-02", end: "2026-01-02", startTime: "14:00", endTime: "16:00",
                timeZone: "UTC"))
        let source = try snapshot([event])
        let start = try #require(TripClock.instant(local: "2026-01-02T14:00", zone: "UTC"))
        let end = try #require(TripClock.instant(local: "2026-01-02T16:00", zone: "UTC"))
        #expect(TripTodayProjection(snapshot: source, at: start).now.contains(.event(event)))
        #expect(!TripTodayProjection(snapshot: source, at: end).now.contains(.event(event)))
        let unknown = self.event(
            timing: .init(
                start: nil, end: "2026-02-02", startTime: nil, endTime: "16:00", timeZone: "UTC"))
        let projection = TripTodayProjection(snapshot: try snapshot([unknown]), at: start)
        #expect(projection.other.contains(.event(unknown)))
        #expect(!projection.next.contains(.event(unknown)))
    }

    @Test("floating event dates retain their day while precise endpoints use the display zone")
    internal func calendarPrecision() throws {
        let floating = event(
            timing: .init(
                start: "2026-01-02", end: nil, startTime: nil, endTime: nil, timeZone: nil))
        let zone = try #require(TimeZone(identifier: "Pacific/Honolulu"))
        let facts = tripCalendarFacts(try snapshot([floating]), zone: zone)
            .filter { $0.source.id == "event-7" }
        #expect(facts.count == 1)
        #expect(facts.first?.day == "2026-01-02")
        #expect(facts.first?.instant == nil)
        let precise = event(
            timing: .init(
                start: "2026-01-02", end: nil, startTime: "01:00", endTime: nil, timeZone: "UTC"))
        let converted = tripCalendarFacts(try snapshot([precise]), zone: zone)
            .filter { $0.source.id == "event-7" }
        #expect(converted.first?.day == "2026-01-01")
        #expect(converted.first?.instant != nil)
    }

    @Test("event search and missing visit findings retain exact source identity")
    internal func sourceContext() throws {
        let event = event(
            timing: .init(start: nil, end: nil, startTime: nil, endTime: nil, timeZone: nil),
            visitId: 999)
        let source = try snapshot([event])
        #expect(tripSourceMatches(.event(event), query: "EVT7", places: source.places))
        #expect(!tripSourceMatches(.event(event), query: "unrelated", places: source.places))
        #expect(tripReferenceFindings(source).map(\.id) == ["event-7"])
        #expect(source.events == [event])
        #expect(event.visitId == 999)
    }

    private func snapshot(_ events: [TripEvent]) throws -> TripSnapshot {
        let source = try TripTestSources.snapshot()
        return TripSnapshot(
            trip: source.trip, places: source.places, visits: source.visits,
            journeys: source.journeys, journeyGroups: source.journeyGroups, stays: source.stays,
            events: events, documentAssociations: source.documentAssociations)
    }

    private func event(
        timing: TripEventTiming, visitId: Int? = nil, intention: String? = "Considering"
    ) -> TripEvent {
        TripEvent(
            id: 7, tripId: 1, visitId: visitId, name: "Source event", intention: intention,
            arrangement: "Not arranged", purchase: "Purchased", timing: timing, address: nil,
            reference: "EVT7", sourceUrl: nil, ticketUrl: nil, notes: "Source notes",
            sourceLinks: [], venueLinks: [], organiserLinks: [], documentLinks: [])
    }
}
