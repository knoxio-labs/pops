import AppCore
import Foundation
import Testing

@testable import FeatureTrips

@Suite("Calendar fact ordering")
internal struct TripCalendarOrderingTests {
    @Test(
        "Journey day precision stays on the supplied day in every display zone without an instant")
    internal func journeyDay() throws {
        let original = try TripTestSources.snapshot()
        let journey = try #require(original.journeys.first)
        let leg = try #require(journey.legs.first)
        let dayLeg = TripJourneyLeg(
            id: leg.id, journeyId: leg.journeyId, mode: leg.mode,
            from: TripEndpoint(
                placeId: nil, sourceLabel: nil, sourceLinks: nil, local: nil,
                timeZone: "Pacific/Kiritimati", date: "2028-02-29"),
            to: TripEndpoint(
                placeId: nil, sourceLabel: nil, sourceLinks: nil, local: nil,
                timeZone: nil, date: "2028-03-02"),
            intention: leg.intention, arrangement: leg.arrangement, purchase: leg.purchase,
            operator: leg.operator, service: leg.service, reference: leg.reference,
            notes: leg.notes, sourceLinks: leg.sourceLinks)
        let source = TripJourney(
            id: journey.id, tripId: journey.tripId, name: journey.name,
            reference: journey.reference, notes: journey.notes, sourceLinks: journey.sourceLinks,
            buffers: journey.buffers, legs: [dayLeg])
        for identifier in ["Pacific/Honolulu", "Pacific/Kiritimati"] {
            let facts = tripCalendarFacts(
                sources: [.journey(source)], zone: try #require(TimeZone(identifier: identifier)))
            #expect(facts.map(\.day) == ["2028-02-29", "2028-03-02"])
            #expect(facts.allSatisfy { $0.instant == nil })
            #expect(facts.map(\.label) == ["Departure · \(leg.id)", "Arrival · \(leg.id)"])
            var filter = TripTimelineFilter()
            filter.fromDay = "2028-03-01"
            filter.throughDay = "2028-03-01"
            #expect(
                !filter.includes(
                    .journey(source), zone: try #require(TimeZone(identifier: identifier))))
            filter.fromDay = "2028-02-29"
            filter.throughDay = "2028-02-29"
            #expect(
                filter.includes(
                    .journey(source), zone: try #require(TimeZone(identifier: identifier))))
        }
    }

    @Test("resolved clocks precede floating dates consistently for every source permutation")
    internal func mixedPrecision() throws {
        let early = stay(id: 3, clock: "10:00")
        let floating = stay(id: 2, clock: nil)
        let late = stay(id: 1, clock: "12:00")
        let orders = [
            [early, floating, late], [early, late, floating],
            [floating, early, late], [floating, late, early],
            [late, early, floating], [late, floating, early],
        ]
        for order in orders {
            let facts = try project(order)
            #expect(facts.map(\.source.id) == ["stay-3", "stay-1", "stay-2"])
            #expect(facts.map(\.day) == Array(repeating: "2026-01-02", count: 3))
            #expect(facts.last?.instant == nil)
            #expect(facts.compactMap(\.instant).count == 2)
        }
    }

    @Test("equal clocks and floating facts use stable source identity within their precision group")
    internal func stableTies() throws {
        let facts = try project([
            stay(id: 4, clock: nil), stay(id: 3, clock: "10:00"),
            stay(id: 2, clock: nil), stay(id: 1, clock: "10:00"),
        ])
        #expect(facts.map(\.source.id) == ["stay-1", "stay-3", "stay-2", "stay-4"])
    }

    private func project(_ stays: [TripStay]) throws -> [TripCalendarFact] {
        let original = try TripTestSources.snapshot()
        let snapshot = TripSnapshot(
            trip: original.trip, places: [], visits: [], journeys: [], journeyGroups: [],
            stays: stays, events: [], documentAssociations: [])
        return tripCalendarFacts(snapshot, zone: try #require(TimeZone(identifier: "UTC")))
    }

    private func stay(id: Int, clock: String?) -> TripStay {
        TripStay(
            id: id, tripId: 1, visitId: nil, name: nil, kind: nil, status: nil,
            timing: TripStayTiming(
                arrival: "2026-01-02", departure: nil, checkIn: clock, checkOut: nil,
                timeZone: clock == nil ? nil : "UTC"),
            address: nil, reference: nil, notes: "", sourceLinks: [], hostLinks: [],
            documentLinks: [])
    }
}
