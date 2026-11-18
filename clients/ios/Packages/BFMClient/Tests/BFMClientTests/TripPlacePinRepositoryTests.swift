import AppCore
import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import BFMClient

@Suite("BFM Trips place pin writes")
internal struct TripPlacePinRepositoryTests {
    @Test("persists the explicit coordinate through the trip scoped operation")
    internal func updatePin() async throws {
        let body = PinRequestBody()
        let transport = StubTransport { _, requestBody in
            await body.record(try await Data(collecting: requestBody ?? HTTPBody(), upTo: 65_536))
            return Self.response(status: .ok, json: Self.placeJSON(pin: Self.selectedPin))
        }
        let repository = try BFMTripsRepository.stubbed(transport)
        let pin = try TripPlacePin(latitude: -8.0476, longitude: -34.8770)

        let saved = try #require(try await repository.updatePin(tripID: 7, placeID: 11, pin: pin))

        #expect(saved.id == 11)
        #expect(saved.pin == pin)
        let calls = await transport.recorded.all
        #expect(calls.count == 1)
        #expect(calls.first?.operationID == "mobileTrips.updatePlacePin")
        #expect(calls.first?.request.path == "/mobile/trips/7/places/11/pin")
        #expect(calls.first?.request.method == .patch)
        let bytes = try #require(await body.value)
        let json = try #require(JSONSerialization.jsonObject(with: bytes) as? [String: Any])
        let sentPin = try #require(json["pin"] as? [String: Double])
        #expect(sentPin["latitude"] == pin.latitude)
        #expect(sentPin["longitude"] == pin.longitude)
    }

    @Test("rejects a successful response for another place identity")
    internal func mismatchedPlace() async throws {
        let transport = StubTransport(
            status: .ok,
            json: Self.placeJSON(id: 12, pin: Self.selectedPin)
        )
        let repository = try BFMTripsRepository.stubbed(transport)
        let pin = try TripPlacePin(latitude: -8.0476, longitude: -34.8770)

        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository.updatePin(tripID: 7, placeID: 11, pin: pin)
        }
    }

    @Test("rejects a successful response when the saved pin differs from the requested pin")
    internal func mismatchedPin() async throws {
        let transport = StubTransport(
            status: .ok,
            json: Self.placeJSON(pin: #"{"latitude":-8.05,"longitude":-34.88}"#)
        )
        let repository = try BFMTripsRepository.stubbed(transport)
        let pin = try TripPlacePin(latitude: -8.0476, longitude: -34.8770)

        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository.updatePin(tripID: 7, placeID: 11, pin: pin)
        }
    }

    @Test("rejects a successful response when the saved place has no pin")
    internal func missingPin() async throws {
        let transport = StubTransport(status: .ok, json: Self.placeJSON(pin: "null"))
        let repository = try BFMTripsRepository.stubbed(transport)
        let pin = try TripPlacePin(latitude: -8.0476, longitude: -34.8770)

        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository.updatePin(tripID: 7, placeID: 11, pin: pin)
        }
    }

    @Test("returns nil when the source place no longer exists")
    internal func missingPlace() async throws {
        let repository = try BFMTripsRepository.stubbed(
            StubTransport(status: .notFound, json: #"{"code":"not_found","message":"Missing"}"#)
        )
        let pin = try TripPlacePin(latitude: -8.0476, longitude: -34.8770)

        #expect(try await repository.updatePin(tripID: 7, placeID: 11, pin: pin) == nil)
    }

    @Test("maps missing write capability to feature unavailable")
    internal func deniedCapability() async throws {
        let repository = try BFMTripsRepository.stubbed(
            StubTransport(
                status: .forbidden,
                json:
                    #"{"code":"capability_not_granted","message":"Denied","capability":"trips.write"}"#
            )
        )
        let pin = try TripPlacePin(latitude: -8.0476, longitude: -34.8770)

        await #expect(throws: RepositoryError.featureUnavailable) {
            try await repository.updatePin(tripID: 7, placeID: 11, pin: pin)
        }
    }

    private static let selectedPin = #"{"latitude":-8.0476,"longitude":-34.877}"#

    private static func placeJSON(id: Int = 11, pin: String) -> String {
        """
            {"id":\(id),"name":"Recife","sourceLinks":[],"createdAt":"2028-01-01T00:00:00Z",
            "updatedAt":"2028-01-02T00:00:00Z","pin":\(pin)}
            """
    }

    private static func response(
        status: HTTPResponse.Status, json: String
    ) -> (HTTPResponse, HTTPBody?) {
        (
            HTTPResponse(status: status, headerFields: [.contentType: "application/json"]),
            HTTPBody(json)
        )
    }
}

private actor PinRequestBody {
    private(set) var value: Data?

    func record(_ value: Data) {
        self.value = value
    }
}
