import AppCore
import Testing

@testable import BFMClient

@Suite("BFM Trips place pin writes")
internal struct TripPlacePinRepositoryTests {
    @Test("persists the explicit coordinate through the trip scoped operation")
    internal func updatePin() async throws {
        let transport = StubTransport(
            status: .ok,
            json:
                #"{"id":11,"name":"Recife","sourceLinks":[],"createdAt":"2028-01-01T00:00:00Z","updatedAt":"2028-01-02T00:00:00Z","pin":{"latitude":-8.0476,"longitude":-34.8770}}"#
        )
        let repository = try BFMTripsRepository.stubbed(transport)
        let pin = try TripPlacePin(latitude: -8.0476, longitude: -34.8770)

        let saved = try #require(try await repository.updatePin(tripID: 7, placeID: 11, pin: pin))

        #expect(saved.id == 11)
        #expect(saved.pin == pin)
        let calls = await transport.recorded.all
        #expect(calls.count == 1)
        #expect(calls.first?.operationID == "mobileTrips.updatePlacePin")
        #expect(calls.first?.request.path == "/mobile/trips/7/places/11/pin")
    }

    @Test("rejects a successful response for another place identity")
    internal func mismatchedPlace() async throws {
        let transport = StubTransport(
            status: .ok,
            json:
                #"{"id":12,"name":"Recife","sourceLinks":[],"createdAt":"2028-01-01T00:00:00Z","updatedAt":"2028-01-02T00:00:00Z","pin":{"latitude":-8.0476,"longitude":-34.8770}}"#
        )
        let repository = try BFMTripsRepository.stubbed(transport)
        let pin = try TripPlacePin(latitude: -8.0476, longitude: -34.8770)

        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository.updatePin(tripID: 7, placeID: 11, pin: pin)
        }
    }
}
