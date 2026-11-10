import AppCore
import Foundation
import Testing

@testable import FeatureTrips

@Suite("Known future source starts")
internal struct TripFutureStartTests {
    internal enum Kind: CaseIterable {
        case stay, event, journey
    }

    @Test(
        "future starts remain Next with reversed, unknown or normal ends", arguments: Kind.allCases)
    internal func futureStarts(_ kind: Kind) throws {
        let now = try instant("2026-01-02T12:00")
        for end in ["2026-01-01", nil, "2026-01-04"] {
            let value = source(kind, end: end)
            let projection = TripTodayProjection(snapshot: snapshot(value), at: now)
            #expect(projection.next == [value])
            #expect(projection.now.isEmpty)
            #expect(projection.other.isEmpty)
            #expect(TripBookingScope.currentAndFuture.includes(value, at: now))
            #expect(!TripBookingScope.past.includes(value, at: now))
            #expect(TripBookingScope.all.includes(value, at: now))
            if end == "2026-01-01" {
                #expect(try #require(value.start) > #require(value.end))
            }
        }
    }

    @Test("Now and bookings retain inclusive start and exclusive end", arguments: Kind.allCases)
    internal func boundaries(_ kind: Kind) throws {
        let value = source(kind, end: "2026-01-04")
        let start = try instant("2026-01-03T14:00")
        let end = try instant("2026-01-04T16:00")
        #expect(TripTodayProjection(snapshot: snapshot(value), at: start).now == [value])
        #expect(TripTodayProjection(snapshot: snapshot(value), at: start).next.isEmpty)
        #expect(TripBookingScope.currentAndFuture.includes(value, at: start))
        #expect(TripTodayProjection(snapshot: snapshot(value), at: end).now.isEmpty)
        #expect(TripTodayProjection(snapshot: snapshot(value), at: end).next.isEmpty)
        #expect(!TripBookingScope.currentAndFuture.includes(value, at: end))
        #expect(TripBookingScope.past.includes(value, at: end))
    }

    @Test("reversed intervals never become Now or Past", arguments: Kind.allCases)
    internal func reversedIntervals(_ kind: Kind) throws {
        let value = source(kind, end: "2026-01-01")
        let now = try instant("2026-01-03T14:00")
        let projection = TripTodayProjection(snapshot: snapshot(value), at: now)
        #expect(projection.now.isEmpty)
        #expect(projection.next.isEmpty)
        #expect(projection.other == [value])
        #expect(!TripBookingScope.currentAndFuture.includes(value, at: now))
        #expect(!TripBookingScope.past.includes(value, at: now))
    }

    private func instant(_ value: String) throws -> Date {
        try #require(TripClock.instant(local: value, zone: "UTC"))
    }

    private func source(_ kind: Kind, end: String?) -> TripSource {
        let start = "2026-01-03"
        switch kind {
        case .stay:
            return .stay(
                TripStay(
                    id: 1, tripId: 1, visitId: nil, name: "Recorded stay", kind: nil,
                    status: nil,
                    timing: TripStayTiming(
                        arrival: start, departure: end, checkIn: "14:00",
                        checkOut: end == nil ? nil : "16:00", timeZone: "UTC"), address: nil,
                    reference: nil, notes: "", sourceLinks: [], hostLinks: [], documentLinks: []))
        case .event:
            return .event(
                TripEvent(
                    id: 1, tripId: 1, visitId: nil, name: "Recorded event", intention: nil,
                    arrangement: nil, purchase: nil,
                    timing: TripEventTiming(
                        start: start, end: end,
                        startTime: "14:00", endTime: end == nil ? nil : "16:00", timeZone: "UTC"),
                    address: nil, reference: nil, sourceUrl: nil, ticketUrl: nil, notes: "",
                    sourceLinks: [],
                    venueLinks: [], organiserLinks: [], documentLinks: []))
        case .journey:
            return journey(end: end)
        }
    }

    private func journey(end: String?) -> TripSource {
        let leg = TripJourneyLeg(
            id: 1, journeyId: 1, mode: nil,
            from: TripEndpoint(
                placeId: nil, sourceLabel: "Recorded departure", sourceLinks: nil,
                local: "2026-01-03T14:00", timeZone: "UTC"),
            to: TripEndpoint(
                placeId: nil, sourceLabel: "Recorded arrival", sourceLinks: nil,
                local: end.map { "\($0)T16:00" }, timeZone: "UTC"),
            intention: nil, arrangement: nil, purchase: nil, operator: nil, service: nil,
            reference: nil, notes: "", sourceLinks: [])
        return .journey(
            TripJourney(
                id: 1, tripId: 1, name: "Recorded journey", reference: nil,
                notes: "", sourceLinks: [],
                buffers: TripJourneyBuffers(
                    minimumConnectionMinutes: nil,
                    airportBufferMinutes: nil), legs: [leg]))
    }

    private func snapshot(_ source: TripSource) -> TripSnapshot {
        var stays: [TripStay] = []
        var events: [TripEvent] = []
        var journeys: [TripJourney] = []
        switch source {
        case .stay(let item): stays = [item]
        case .event(let item): events = [item]
        case .journey(let item): journeys = [item]
        }
        return TripSnapshot(
            trip: TripRecord(
                id: 1, name: "Review trip", destination: "", when: "",
                tagId: nil, parentId: nil, notes: "", sourceLinks: []), places: [], visits: [],
            journeys: journeys, journeyGroups: [], stays: stays, events: events,
            documentAssociations: [])
    }
}
