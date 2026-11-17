import AppCore
import Testing

@testable import FeatureTrips

struct TripPlanMapProjectionTests {
    @Test func includesCanonicalAndAlternativeRoutePlacesOnceInRouteOrder() {
        let snapshot = snapshot()
        let route = TripRouteSnapshot(
            tripId: 7,
            revision: 2,
            order: [.visit(12), .journey(44)],
            paths: [
                TripRoutePath(
                    id: 90, title: "Coast", gapId: 5, state: .alternative,
                    members: [.visit(13)])
            ],
            missingSources: [])

        #expect(
            TripPlanMapProjection(route: route, snapshot: snapshot).places.map(\.id) == [1, 2, 3])
        #expect(
            TripPlanMapProjection(route: route, snapshot: snapshot).paths.map { $0.map(\.id) }
                == [[1, 2], [3]])
    }

    @Test func excludesAllPlacesForAnotherTripAndNilSnapshot() {
        let route = TripRouteSnapshot(
            tripId: 8, revision: 1, order: [.visit(12)], paths: [], missingSources: [])

        #expect(TripPlanMapProjection(route: route, snapshot: snapshot()).places.isEmpty)
        #expect(TripPlanMapProjection(route: route, snapshot: nil).places.isEmpty)
    }

    @Test func mapLinesStopAtPlacesWithoutPins() throws {
        let pin1 = try TripPlacePin(latitude: -33.87, longitude: 151.21)
        let pin3 = try TripPlacePin(latitude: -23.55, longitude: -46.63)
        let pin4 = try TripPlacePin(latitude: -22.91, longitude: -43.17)
        let pins = [
            1: pin1,
            3: pin3,
            4: pin4,
        ]
        let route = TripRouteSnapshot(
            tripId: 7,
            revision: 2,
            order: [.visit(12), .journey(44), .visit(13), .visit(14)],
            paths: [],
            missingSources: [])

        let segments = TripPlanMapProjection(route: route, snapshot: snapshot(pins: pins))
            .pinnedSegments { $0.pin }

        #expect(segments == [TripPlanMapSegment(pathIndex: 0, pins: [pin3, pin4])])
    }

    private func snapshot(pins: [Int: TripPlacePin] = [:]) -> TripSnapshot {
        let trip = TripRecord(
            id: 7, name: "Brazil", destination: "Brazil", when: "", tagId: nil,
            parentId: nil, notes: "", sourceLinks: [])
        let places = [
            TripPlace(id: 1, name: "São Paulo", pin: pins[1], sourceLinks: []),
            TripPlace(id: 2, name: "Recife", pin: pins[2], sourceLinks: []),
            TripPlace(id: 3, name: "Olinda", pin: pins[3], sourceLinks: []),
            TripPlace(id: 4, name: "Not on route", pin: pins[4], sourceLinks: []),
        ]
        let visits = [
            TripVisit(
                id: 12, tripId: 7, placeId: 1,
                timing: .init(arrival: nil, departure: nil, month: nil, duration: nil),
                notes: "", sourceLinks: []),
            TripVisit(
                id: 13, tripId: 7, placeId: 3,
                timing: .init(arrival: nil, departure: nil, month: nil, duration: nil),
                notes: "", sourceLinks: []),
            TripVisit(
                id: 14, tripId: 7, placeId: 4,
                timing: .init(arrival: nil, departure: nil, month: nil, duration: nil),
                notes: "", sourceLinks: []),
        ]
        let leg = TripJourneyLeg(
            id: 50, journeyId: 44, mode: "flight",
            from: .init(placeId: 1, sourceLabel: nil, sourceLinks: nil, local: nil, timeZone: nil),
            to: .init(placeId: 2, sourceLabel: nil, sourceLinks: nil, local: nil, timeZone: nil),
            intention: nil, arrangement: nil, purchase: nil, operator: nil, service: nil,
            reference: nil, notes: "", sourceLinks: [])
        let journey = TripJourney(
            id: 44, tripId: 7, name: nil, reference: nil, notes: "", sourceLinks: [],
            buffers: .init(minimumConnectionMinutes: nil, airportBufferMinutes: nil), legs: [leg])
        return TripSnapshot(
            trip: trip, places: places, visits: visits, journeys: [journey], journeyGroups: [],
            stays: [], events: [], documentAssociations: [])
    }
}
