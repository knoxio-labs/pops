import AppCore
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import BFMClient

@Suite("BFM Trips pagination recovery")
internal struct TripsPaginationTests {
    @Test("a stale snapshot restarts the complete read without mixing the abandoned partial result")
    internal func staleSnapshot() async throws {
        let script = TripReadScript([
            (.ok, TripsWire.page([1], cursor: "stale", total: 2)),
            (.badRequest, TripsWire.failure("invalid_cursor")),
            (.ok, TripsWire.page([3], cursor: "fresh", total: 2)),
            (.ok, TripsWire.page([4], cursor: nil, total: 2)),
        ])
        let transport = script.transport()
        let repository = try BFMTripsRepository.stubbed(transport)
        #expect(try await repository.trips().map(\.id) == [3, 4])
        let calls = await transport.recorded.all
        #expect(calls.count == 4)
        #expect(calls.first?.request.path?.contains("cursor=") == false)
        #expect(calls.dropFirst(2).first?.request.path?.contains("cursor=") == false)
    }

    @Test("a second stale snapshot fails within a bounded retry instead of looping")
    internal func repeatedStaleSnapshot() async throws {
        let script = TripReadScript([
            (.ok, TripsWire.page([1], cursor: "stale", total: 2)),
            (.badRequest, TripsWire.failure("invalid_cursor")),
            (.ok, TripsWire.page([3], cursor: "fresh", total: 2)),
            (.badRequest, TripsWire.failure("invalid_cursor")),
        ])
        let transport = script.transport()
        let repository = try BFMTripsRepository.stubbed(transport)
        await #expect(throws: RepositoryError.conflict(TripsReadPolicy.sourceChangedReason)) {
            try await repository.trips()
        }
        #expect(await transport.recorded.all.count == 4)
    }

    @Test("cursor cycles are rejected even when each page contains different source identities")
    internal func cursorCycle() async throws {
        let script = TripReadScript([
            (.ok, TripsWire.page([1], cursor: "cycle", total: 3)),
            (.ok, TripsWire.page([2], cursor: "cycle", total: 3)),
        ])
        let transport = script.transport()
        let repository = try BFMTripsRepository.stubbed(transport)
        await #expect(throws: RepositoryError.contractMismatch) { try await repository.trips() }
        #expect(await transport.recorded.all.count == 2)
    }
}

private actor TripReadScript {
    private var responses: [(HTTPResponse.Status, String)]

    internal init(_ responses: [(HTTPResponse.Status, String)]) { self.responses = responses }

    nonisolated internal func transport() -> StubTransport {
        StubTransport { _, _ in
            let response = try await self.next()
            return (
                HTTPResponse(status: response.0, headerFields: [.contentType: "application/json"]),
                HTTPBody(response.1)
            )
        }
    }

    private func next() throws -> (HTTPResponse.Status, String) {
        guard !responses.isEmpty else { throw RepositoryError.contractMismatch }
        return responses.removeFirst()
    }
}
