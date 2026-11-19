import AppCore
import Testing

@testable import FeatureTrips

@Suite("Trips search")
internal struct TripSourceSearchTests {
    @Test("journey search includes flight details, local schedule, and references")
    internal func journeyDetails() throws {
        let snapshot = try TripTestSources.snapshot()
        let journey = try #require(snapshot.journeys.first { $0.id == 1 })
        let source = TripSource.journey(journey)

        #expect(tripSourceMatches(source, query: "flight", places: snapshot.places))
        #expect(tripSourceMatches(source, query: "AB10", places: snapshot.places))
        #expect(tripSourceMatches(source, query: "2026-02-01", places: snapshot.places))
        #expect(tripSourceMatches(source, query: "UTC", places: snapshot.places))
        #expect(!tripSourceMatches(source, query: "2027-02-01", places: snapshot.places))
        #expect(TripsSearchFilter.flights.includes(source))

        let alternate = try #require(snapshot.journeys.first { $0.id == 2 })
        #expect(!TripsSearchFilter.flights.includes(.journey(alternate)))
        #expect(
            tripSearchSourceDetail(.journey(alternate), snapshot: snapshot)?.contains(
                "Alternative journey") == true)
        #expect(
            tripSearchSourceDetail(source, snapshot: snapshot)?.contains("Alternative journey")
                != true)
    }

    @Test("stay and calendar search cover their exact dates, states, and references")
    internal func stayAndEventDetails() throws {
        let snapshot = try TripTestSources.snapshot()
        let stay = try #require(snapshot.stays.first { $0.id == 1 })
        #expect(tripSourceMatches(.stay(stay), query: "Reserved", places: snapshot.places))
        #expect(tripSourceMatches(.stay(stay), query: "2026-01-03", places: snapshot.places))
        #expect(tripSourceMatches(.stay(stay), query: "Source address", places: snapshot.places))
        #expect(TripsSearchFilter.stays.includes(.stay(stay)))

        let event = TripEvent(
            id: 8,
            tripId: 1,
            visitId: nil,
            name: "Dinner with family",
            intention: "Considering",
            arrangement: nil,
            purchase: nil,
            timing: TripEventTiming(
                start: "2026-12-25", end: nil, startTime: "19:30", endTime: nil,
                timeZone: "America/Sao_Paulo"),
            address: nil,
            reference: "TABLE25",
            sourceUrl: nil,
            ticketUrl: nil,
            notes: "Christmas dinner",
            sourceLinks: [],
            venueLinks: [],
            organiserLinks: [],
            documentLinks: []
        )
        let source = TripSource.event(event)
        #expect(tripSourceMatches(source, query: "2026-12-25", places: []))
        #expect(tripSourceMatches(source, query: "19:30", places: []))
        #expect(tripSourceMatches(source, query: "TABLE25", places: []))
        #expect(tripSourceMatches(source, query: "Sao Paulo", places: []))
        #expect(TripsSearchFilter.events.includes(source))
        #expect(!TripsSearchFilter.stays.includes(source))
        #expect(!TripsSearchFilter.places.includes(source))
        #expect(TripsSearchFilter.all.includes(source))
    }

    @Test("trip plan search matches places, visit notes, and only recorded timing values")
    internal func planContent() throws {
        let place = TripPlace(id: 4, name: "São Paulo", sourceLinks: [])
        let visit = TripVisit(
            id: 7,
            tripId: 1,
            placeId: 4,
            timing: TripVisitTiming(
                arrival: "2026-12-01", departure: nil,
                month: nil, duration: nil),
            notes: "Stay with family",
            sourceLinks: []
        )
        #expect(tripPlaceMatches(place, query: "sao paulo"))
        #expect(tripVisitMatches(visit, place: place, query: "family"))
        #expect(tripVisitMatches(visit, place: place, query: "2026-12-01"))
        let undatedVisit = TripVisit(
            id: 8,
            tripId: 1,
            placeId: 4,
            timing: TripVisitTiming(arrival: nil, departure: nil, month: nil, duration: nil),
            notes: "Stay with family",
            sourceLinks: []
        )
        #expect(!tripVisitMatches(undatedVisit, place: nil, query: "0"))
    }

    @Test("trip metadata search is case and accent insensitive and ignores blank queries")
    internal func tripMetadata() {
        let trip = TripRecord(
            id: 2,
            name: "Brazil via Dallas",
            destination: "São Paulo",
            when: "late November",
            tagId: nil,
            parentId: nil,
            notes: "Stay with Dad",
            sourceLinks: []
        )
        #expect(tripRecordMatches(trip, query: "sao paulo"))
        #expect(tripRecordMatches(trip, query: "STAY WITH DAD"))
        #expect(tripRecordMatches(trip, query: "  "))
        #expect(!tripRecordMatches(trip, query: "2028"))
    }
}
