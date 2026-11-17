import AppCore
import Foundation
import Testing

struct TripPlacePinTests {
    @Test func acceptsGeographicBoundariesAndRoundTripsExplicitPoints() throws {
        for pin in [
            try TripPlacePin(latitude: -90, longitude: -180),
            try TripPlacePin(latitude: 90, longitude: 180),
            try TripPlacePin(latitude: -33.8688, longitude: 151.2093),
        ] {
            let encoded = try JSONEncoder().encode(pin)
            #expect(try JSONDecoder().decode(TripPlacePin.self, from: encoded) == pin)
        }
    }

    @Test(arguments: [(91.0, 0.0), (-91.0, 0.0), (0.0, 181.0), (0.0, -181.0)])
    func rejectsCoordinatesOutsideGeographicBounds(latitude: Double, longitude: Double) {
        #expect(throws: TripPlacePinError.self) {
            try TripPlacePin(latitude: latitude, longitude: longitude)
        }
    }

    @Test func rejectsIncompletePinsWhenDecoding() {
        let bytes = Data(#"{"latitude":-33.8688}"#.utf8)
        #expect(throws: (any Error).self) {
            try JSONDecoder().decode(TripPlacePin.self, from: bytes)
        }
    }

    @Test func tripPlaceDecodesOlderPayloadWithoutPin() throws {
        let bytes = Data(
            #"{"id":11,"name":"Recife","sourceLinks":[]}"#.utf8)
        let place = try JSONDecoder().decode(TripPlace.self, from: bytes)
        #expect(place.pin == nil)
    }
}
