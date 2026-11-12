import Foundation
import OpenAPIRuntime
import Testing

@testable import BFMClient

@Suite("Installed Trips detail wire")
internal struct TripsLegacyDetailTests {
    @Test(
        "the real generated legacy decoder rejects a new day field rather than silently discarding it"
    )
    internal func rejectsDayField() async throws {
        let dayAware = TripsWire.detail.replacingOccurrences(
            of: #""local":"2026-01-02T12:00""#, with: #""date":"2028-02-29""#)
        #expect(dayAware != TripsWire.detail)
        let client = try legacyClient(dayAware)
        do {
            _ = try await client.generated.mobileTrips_getTrip(path: .init(id: 1))
            Issue.record("Expected the legacy generated operation to reject the day field")
        } catch let error as ClientError {
            #expect(
                BFMRepositoryFailure.failure(error, operation: Operations.MobileTrips_getTrip.id)
                    == .contractMismatch)
        }
    }

    @Test("the unchanged legacy decoder accepts source facts with an unknown clock and no day key")
    internal func acceptsLegacyProjection() async throws {
        let legacy = TripsWire.detail.replacingOccurrences(
            of: #""local":"2026-01-02T12:00","#, with: "")
        #expect(legacy != TripsWire.detail)
        let client = try legacyClient(legacy)
        let result = try await client.generated.mobileTrips_getTrip(path: .init(id: 1))
        guard case .ok(let response) = result else {
            Issue.record("Expected the legacy detail response")
            return
        }
        let decoded = try response.body.json
        let endpoint = try #require(decoded.journeys.first?.legs.first?.from)
        #expect(endpoint.local == nil)
        #expect(endpoint.sourceLabel == "Recorded departure")
        #expect(endpoint.timeZone == nil)
    }

    private func legacyClient(_ body: String) throws -> BFMHTTPClient {
        BFMHTTPClient(
            baseURL: try #require(URL(string: "https://bfm.example")),
            transport: StubTransport(status: .ok, json: body))
    }
}
