import AppCore
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import BFMClient

@Suite("BFM Trips source reads")
internal struct TripsReadTests {
    @Test("every page is consumed with exact source metadata and no implicit first-trip selection")
    internal func pagedCatalogue() async throws {
        let transport = StubTransport { request, _ in
            let next = request.path?.contains("cursor=next") == true
            return (
                HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]),
                HTTPBody(TripsWire.page(next ? [2] : [1], cursor: next ? nil : "next", total: 2))
            )
        }
        let repository = try BFMTripsRepository.stubbed(transport)
        let result = try await repository.trips()
        #expect(result.map(\.id) == [1, 2])
        #expect(result.first?.when == "Summer")
        #expect(result.first?.sourceLinks.first?.uri == "pops:documents/document/123")
        let calls = await transport.recorded.all
        #expect(calls.count == 2)
        #expect(calls.allSatisfy { $0.operationID == "mobileTrips.listTrips" })
        #expect(calls.first?.request.path?.contains("limit=100") == true)
    }

    @Test("detail retains authoritative leg order, missing zone and independent booking facts")
    internal func sourceDetail() async throws {
        let repository = try BFMTripsRepository.stubbed(
            StubTransport(status: .ok, json: TripsWire.detail))
        let source = try #require(try await repository.trip(id: 1))
        let journey = try #require(source.journeys.first)
        #expect(journey.legs.map(\.id) == [22, 11])
        #expect(journey.legs.first?.from.local == "2026-01-02T12:00")
        #expect(journey.legs.first?.from.timeZone == nil)
        #expect(journey.legs.first?.intention == "Considering")
        #expect(journey.legs.first?.arrangement == "Booked")
        #expect(journey.legs.first?.purchase == nil)
        #expect(source.stays.isEmpty)
    }

    @Test("a successful HTTP response cannot substitute another trip's source identity")
    internal func mismatchedOwner() async throws {
        for body in [
            TripsWire.detail.replacingOccurrences(of: "\"tripId\":1", with: "\"tripId\":999"),
            TripsWire.detail.replacingOccurrences(of: "\"journeyId\":3", with: "\"journeyId\":999"),
            TripsWire.detail.replacingOccurrences(of: "\"id\":11", with: "\"id\":22"),
        ] {
            let repository = try BFMTripsRepository.stubbed(StubTransport(status: .ok, json: body))
            await #expect(throws: RepositoryError.contractMismatch) {
                try await repository.trip(id: 1)
            }
        }
        let repository = try BFMTripsRepository.stubbed(
            StubTransport(status: .ok, json: TripsWire.detail))
        await #expect(throws: RepositoryError.contractMismatch) { try await repository.trip(id: 2) }
    }

    @Test("missing, capability-refused and unavailable sources remain distinct from success")
    internal func sourceFailures() async throws {
        let gone = try BFMTripsRepository.stubbed(
            StubTransport(status: .notFound, json: TripsWire.failure("not_found")))
        #expect(try await gone.trip(id: 1) == nil)
        let refused = try BFMTripsRepository.stubbed(
            StubTransport(
                status: .forbidden,
                json:
                    #"{"code":"capability_not_granted","message":"Not granted","capability":"trips.read"}"#
            ))
        await #expect(throws: RepositoryError.featureUnavailable) { try await refused.trips() }
        let unavailable = try BFMTripsRepository.stubbed(
            StubTransport(
                status: .serviceUnavailable, json: TripsWire.failure("upstream_unavailable")))
        await #expect(throws: RepositoryError.unavailable) { try await unavailable.trips() }
    }

    @Test("rate-limit responses retain the service's recorded wait instead of inventing one")
    internal func recordedWait() async throws {
        let repository = try BFMTripsRepository.stubbed(
            StubTransport(
                status: .tooManyRequests,
                json: #"{"code":"rate_limited","message":"Wait","retryAfterSeconds":37}"#))
        await #expect(throws: RepositoryError.rateLimited(retryAfterSeconds: 37)) {
            try await repository.trips()
        }
        await #expect(throws: RepositoryError.rateLimited(retryAfterSeconds: 37)) {
            try await repository.trip(id: 1)
        }
    }

    @Test("truncated, duplicated and cursor-cycling pages fail rather than silently losing records")
    internal func corruptPages() async throws {
        for payload in [
            TripsWire.page([1], cursor: nil, total: 2),
            TripsWire.page([1, 1], cursor: nil, total: 2),
            TripsWire.page([], cursor: "again", total: 1),
        ] {
            let repository = try BFMTripsRepository.stubbed(
                StubTransport(status: .ok, json: payload))
            await #expect(throws: RepositoryError.contractMismatch) { try await repository.trips() }
        }
        let cyclic = try BFMTripsRepository.stubbed(
            StubTransport(
                status: .ok, json: TripsWire.page([1], cursor: "again", total: 2)))
        await #expect(throws: RepositoryError.contractMismatch) { try await cyclic.trips() }
    }
}
