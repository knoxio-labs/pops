import AppCore
import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import BFMClient

@Suite("Real Trips transport classification for offline reads")
internal struct TripOfflineTransportTests {
    @Test(
        "a failed body stream after successful headers preserves URL identity through the generated reader",
        arguments: [
            (URLError.Code.networkConnectionLost, true), (.timedOut, true),
            (.cancelled, false), (.serverCertificateUntrusted, false),
            (.secureConnectionFailed, false), (.userAuthenticationRequired, false),
        ])
    internal func interruptedBody(code: URLError.Code, permits: Bool) async throws {
        let transport = StubTransport { _, _ in
            let stream = AsyncThrowingStream<ArraySlice<UInt8>, any Error> { continuation in
                continuation.yield(ArraySlice(#"{"items":["#.utf8))
                continuation.finish(throwing: URLError(code))
            }
            return (
                HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]),
                HTTPBody(stream, length: .unknown, iterationBehavior: .single)
            )
        }
        let reader = try BFMTripsRepository.stubbed(transport)
        let thrown = await #expect(throws: RepositoryError.self) { try await reader.trips() }
        let failure = try #require(thrown)
        guard case .transport(let payload) = failure else {
            Issue.record("Expected the actual streamed URL failure")
            return
        }
        #expect(payload.urlErrorCode == code)
        #expect(TripOfflineReadPolicy.permitsLastVerifiedRead(after: failure) == permits)
        let calls = await transport.recorded.all
        #expect(calls.count == 1)
        #expect(calls.first?.operationID == "mobileTrips.listTrips")
    }

    @Test(
        "a completed malformed successful body remains a contract failure instead of offline data")
    internal func malformedCompletedBody() async throws {
        let reader = try BFMTripsRepository.stubbed(
            StubTransport(status: .ok, json: #"{"items":["#))
        await #expect(throws: RepositoryError.contractMismatch) { try await reader.trips() }
        #expect(
            !TripOfflineReadPolicy.permitsLastVerifiedRead(after: RepositoryError.contractMismatch))
    }

    @Test(
        "generated client runtime mapping preserves URL identity and admits only network unavailability",
        arguments: [
            (URLError.Code.notConnectedToInternet, true), (.networkConnectionLost, true),
            (.timedOut, true), (.cannotFindHost, true), (.cannotConnectToHost, true),
            (.dnsLookupFailed, true), (.cancelled, false), (.serverCertificateUntrusted, false),
            (.secureConnectionFailed, false), (.userAuthenticationRequired, false),
            (.userCancelledAuthentication, false), (.badServerResponse, false),
        ])
    internal func generated(urlCode: URLError.Code, permits: Bool) async throws {
        let transport = StubTransport { _, _ in throw URLError(urlCode) }
        let repository = try BFMTripsRepository.stubbed(transport)
        let thrown = await #expect(throws: RepositoryError.self) { try await repository.trips() }
        let error = try #require(thrown)
        guard case .transport(let payload) = error else {
            Issue.record("Expected the existing structured transport case")
            return
        }
        #expect(payload.urlErrorCode == urlCode)
        #expect(
            payload.popsError?.code
                == (urlCode == .timedOut ? "ios.net.timeout" : "ios.net.offline"))
        #expect(TripOfflineReadPolicy.permitsLastVerifiedRead(after: error) == permits)
        #expect(await transport.recorded.all.count == 1)
    }

    @Test("HTTP authorization and contract refusals never become URL reachability failures")
    internal func httpRefusal() async throws {
        for status in [401, 403, 404] {
            let transport = StubTransport(
                status: .init(code: status),
                json: #"{"code":"refused","message":"Refused","retryable":false}"#)
            let repository = try BFMTripsRepository.stubbed(transport)
            let thrown = await #expect(throws: RepositoryError.self) {
                try await repository.trips()
            }
            #expect(!TripOfflineReadPolicy.permitsLastVerifiedRead(after: try #require(thrown)))
        }
    }

    @Test(
        "published misconfiguration and unavailable envelopes remain distinct through the real generated reader",
        arguments: [
            ("bfm.upstream.misconfigured", 502, 401, false),
            ("gateway.upstream_misconfigured", 502, 401, false),
            ("upstream_misconfigured", 502, 401, false),
            ("gateway.upstream_unavailable", 503, 503, true),
            ("unknown.failure", 502, 502, false),
        ])
    internal func upstream(code: String, status: Int, upstreamStatus: Int, permits: Bool)
        async throws
    {
        let transport = StubTransport(
            status: .init(code: status),
            json: """
                {"code":"\(code)","message":"Original response","requestId":"request-id",
                "retryable":false,"details":{"upstream":{"pillar":"trips","status":\(upstreamStatus)}}}
                """)
        let reader = try BFMTripsRepository.stubbed(transport)
        let thrown = await #expect(throws: RepositoryError.self) { try await reader.trips() }
        let failure = try #require(thrown)
        #expect(TripOfflineReadPolicy.permitsLastVerifiedRead(after: failure) == permits)
        if case .transport(let payload) = failure {
            #expect(payload.popsError?.code == code)
            #expect(payload.popsError?.message == "Original response")
            #expect(payload.popsError?.retryable == false)
            #expect(payload.urlErrorCode == nil)
            #expect(
                payload.configurationFailure
                    == (code == "unknown.failure" ? nil : .upstreamMisconfigured))
        } else {
            #expect(failure == .unavailable)
        }
    }
}
