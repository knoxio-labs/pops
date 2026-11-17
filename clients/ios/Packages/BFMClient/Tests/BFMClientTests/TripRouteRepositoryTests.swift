import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import BFMClient

@Suite("BFM canonical Trips route reads")
internal struct TripRouteRepositoryTests {
    @Test(
        "the generated route operation retains mixed order, applied history and missing canonical identities"
    )
    internal func canonicalRoute() async throws {
        let expected = TripRouteFixture.snapshot()
        let transport = StubTransport(status: .ok, json: try payload(expected))
        #expect(try await repository(transport).route(tripId: 7) == expected)
        let calls = await transport.recorded.all
        #expect(calls.count == 1)
        #expect(calls.first?.operationID == "mobileTrips.getRoute")
        #expect(calls.first?.request.path == "/mobile/trips/7/route")
    }

    @Test(
        "a wrong owner, missing collection or duplicate active placement cannot become an empty route"
    )
    internal func invalidResponse() async throws {
        let value = TripRouteFixture.snapshot()
        let duplicated = TripRouteSnapshot(
            tripId: 7, revision: value.revision, order: value.order + [.visit(24)],
            paths: value.paths, missingSources: value.missingSources)
        let wrongOwner = try repository(StubTransport(status: .ok, json: try payload(value)))
        await #expect(throws: RepositoryError.contractMismatch) {
            try await wrongOwner.route(tripId: 8)
        }
        for body in [
            try payload(duplicated),
            #"{"tripId":7,"revision":0,"order":[],"paths":[]}"#,
        ] {
            let reader = try repository(StubTransport(status: .ok, json: body))
            await #expect(throws: RepositoryError.contractMismatch) {
                try await reader.route(tripId: 7)
            }
        }
    }

    @Test(
        "only an owner-qualified missing route returns nil; capability denial and outage remain errors"
    )
    internal func failures() async throws {
        let missing = try repository(
            StubTransport(status: .notFound, json: failure("not_found", upstream: true)))
        #expect(try await missing.route(tripId: 7) == nil)
        let unqualified = try repository(
            StubTransport(status: .notFound, json: failure("not_found", upstream: false)))
        await #expect(throws: RepositoryError.contractMismatch) {
            try await unqualified.route(tripId: 7)
        }
        let refused = try repository(
            StubTransport(
                status: .forbidden,
                json:
                    #"{"code":"capability_not_granted","message":"Not granted","capability":"trips.read"}"#
            ))
        await #expect(throws: RepositoryError.featureUnavailable) {
            try await refused.route(tripId: 7)
        }
        let unavailable = try repository(
            StubTransport(
                status: .serviceUnavailable, json: failure("upstream_unavailable", upstream: false))
        )
        await #expect(throws: RepositoryError.unavailable) {
            try await unavailable.route(tripId: 7)
        }
        let limited = try repository(
            StubTransport(
                status: .tooManyRequests,
                json: #"{"code":"rate_limited","message":"Wait","retryAfterSeconds":37}"#))
        await #expect(throws: RepositoryError.rateLimited(retryAfterSeconds: 37)) {
            try await limited.route(tripId: 7)
        }
    }

    private func payload(_ value: TripRouteSnapshot) throws -> String {
        try #require(String(bytes: JSONEncoder().encode(value), encoding: .utf8))
    }

    private func repository(_ transport: StubTransport) throws -> BFMTripRouteRepository {
        BFMTripRouteRepository(
            client: BFMHTTPClient(
                baseURL: try #require(URL(string: "https://bfm.example")), transport: transport))
    }

    private func failure(_ code: String, upstream: Bool) -> String {
        let details = upstream ? #", "details":{"upstream":{"pillar":"trips","status":404}}"# : ""
        return """
            {"code":"\(code)","message":"Request refused","requestId":"route-request","retryable":false\(details)}
            """
    }
}
