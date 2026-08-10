import Foundation
import HTTPTypes
import Testing

@testable import BFMClient

/// What the hand-written façade does with what the generated client returns.
///
/// The generated half is not tested here — it is Apple's code, regenerated from
/// a contract that is itself gated. What is worth asserting is the seam: the
/// mapping into ``BFMHealth``, and the responses the generator represents as
/// data that a caller must never receive as success.
@Suite("BFMHTTPClient.health")
internal struct HealthTests {
    private static let healthyBody = """
        {"ok":true,"status":"ok","pillar":"bfm","version":"0.1.0","ts":"2026-08-08T11:19:25Z"}
        """

    private func client(_ transport: StubTransport) throws -> BFMHTTPClient {
        BFMHTTPClient(
            baseURL: try #require(URL(string: "https://bfm.example")), transport: transport)
    }

    @Test("a documented 200 becomes a BFMHealth")
    func documentedResponseIsMapped() async throws {
        let health = try await client(StubTransport(status: .ok, json: Self.healthyBody)).health()

        #expect(health.pillar == "bfm")
        #expect(health.version == "0.1.0")
        // Parsed here rather than written as an epoch constant, so the assertion
        // is "the client's date transcoder and Foundation agree about this
        // string" rather than "someone did the arithmetic right once".
        #expect(health.reportedAt == (try Date("2026-08-08T11:19:25Z", strategy: .iso8601)))
    }

    @Test("the call goes to GET /health at the given base URL")
    func requestTargetsTheContractsPath() async throws {
        let transport = StubTransport(status: .ok, json: Self.healthyBody)
        _ = try await client(transport).health()

        let sent = try #require(await transport.recorded.all.first)
        #expect(sent.request.method == .get)
        #expect(sent.request.path == "/health")
        #expect(sent.baseURL.absoluteString == "https://bfm.example")
        // The contract's operationId, which is what the pillar SDK's route map
        // is keyed on. A rename on the producer side has to reach this string.
        #expect(sent.operationID == "health")
    }

    /// The case that motivates ``BFMClientError``: the generator models an
    /// undocumented status as a value, so without this mapping a 502 from a
    /// reverse proxy would arrive at a call site as a non-error.
    @Test("an undocumented status throws rather than returning")
    func undocumentedStatusThrows() async throws {
        let transport = StubTransport(status: .badGateway, json: "{}")

        await #expect(
            throws: BFMClientError.undocumentedResponse(
                operation: "health",
                statusCode: 502
            )
        ) {
            try await client(transport).health()
        }
    }

    /// The other half of ``BFMClientError``'s guarantee, which is stated for the
    /// whole module rather than per operation: no `OpenAPIRuntime.ClientError`
    /// leaves it. This call carries no credential — it takes no input at all —
    /// but an invariant with one exception is one a reader has to check rather
    /// than rely on, so it is asserted here too.
    @Test("a transport failure is converted rather than escaping raw")
    func transportFailureIsConverted() async throws {
        let transport = StubTransport { _, _ in throw StubTransportFailure() }

        let thrown = try #require(
            await #expect(throws: BFMClientError.self) { try await client(transport).health() }
        )

        guard case .transportFailure(let operation, let summary) = thrown else {
            Issue.record("expected a transport failure, got \(thrown)")
            return
        }
        #expect(operation == "health")
        #expect(summary.contains("StubTransportFailure"))
    }

    /// A 200 whose body does not match the contract. Worth its own test because
    /// the failure this guards against is a decoder that fills the gaps: a
    /// `BFMHealth` with an empty version reads as a healthy BFM.
    @Test("a 200 missing a required field throws")
    func malformedBodyThrows() async throws {
        let transport = StubTransport(
            status: .ok,
            json: #"{"ok":true,"status":"ok","pillar":"bfm"}"#
        )

        await #expect(throws: (any Error).self) {
            try await client(transport).health()
        }
    }

    /// The contract pins `pillar` to the single value `"bfm"`, so a healthy
    /// answer from some other pillar is a misconfigured base URL rather than a
    /// success. Asserting it here pins that the enum survives regeneration —
    /// widening the contract to a free-form string would make this fail to
    /// compile rather than silently start accepting anything.
    @Test("a healthy answer from another pillar is not decodable as this one")
    func anotherPillarIsRejected() async throws {
        let transport = StubTransport(
            status: .ok,
            json: """
                {"ok":true,"status":"ok","pillar":"finance","version":"0.1.0","ts":"2026-08-08T11:19:25Z"}
                """
        )

        await #expect(throws: (any Error).self) {
            try await client(transport).health()
        }
    }
}
