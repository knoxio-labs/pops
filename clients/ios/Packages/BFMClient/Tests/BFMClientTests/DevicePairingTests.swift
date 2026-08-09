import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import BFMClient

/// The pairing exchange's seam: what the hand-written façade does with each
/// response the contract documents, and with one it does not.
///
/// Every branch matters here in a way it does not for a read endpoint. The BFM
/// answers unknown, expired and consumed codes with one identical 403 on
/// purpose, and answers a malformed key with a 400 — so a client that collapsed
/// the two would either send a person to mint codes against a bug in this
/// build, or leak which of their guesses was a real code.
@Suite("BFMHTTPClient.pairDevice")
internal struct DevicePairingTests {
    private static let createdBody = """
        {"deviceId":"6ba7b810-9dad-41d1-80b4-00c04fd430c8","accessToken":"access-token",\
        "refreshToken":"refresh-token","expiresIn":900}
        """

    private func client(_ transport: StubTransport) throws -> BFMHTTPClient {
        BFMHTTPClient(
            baseURL: try #require(URL(string: "https://bfm.example")), transport: transport)
    }

    private func pair(_ transport: StubTransport) async throws -> IssuedDeviceCredentials {
        try await client(transport).pairDevice(
            code: "7QK4-9M2X-P3ND",
            publicKeyBase64DER: "MFkwEwYHKoZIzj0CAQ==",
            deviceName: "Joao's iPhone",
            deviceModel: "iPhone17,1"
        )
    }

    @Test("a documented 201 becomes IssuedDeviceCredentials")
    func createdResponseIsMapped() async throws {
        let issued = try await pair(StubTransport(status: .created, json: Self.createdBody))

        #expect(issued.deviceId == "6ba7b810-9dad-41d1-80b4-00c04fd430c8")
        #expect(issued.accessToken == "access-token")
        #expect(issued.refreshToken == "refresh-token")
        // Carried as the server's duration, not resolved against this process's
        // clock — see the type's note on why.
        #expect(issued.expiresInSeconds == 900)
    }

    @Test("the call goes to POST /devices/pair with the contract's field names")
    func requestTargetsTheContractsPath() async throws {
        let bodies = RecordedBodies()
        let transport = StubTransport { _, body in
            if let body { await bodies.append(try await Data(collecting: body, upTo: 4096)) }
            return (
                HTTPResponse(status: .created, headerFields: [.contentType: "application/json"]),
                HTTPBody(Self.createdBody)
            )
        }

        _ = try await pair(transport)

        let sent = try #require(await transport.recorded.all.first)
        #expect(sent.request.method == .post)
        #expect(sent.request.path == "/devices/pair")
        // The contract's operationId. A rename on the producer side has to
        // reach this string.
        #expect(sent.operationID == "device.pair")

        let raw = try #require(await bodies.all.first)
        let decoded = try #require(
            try JSONSerialization.jsonObject(with: raw) as? [String: String])
        #expect(decoded["code"] == "7QK4-9M2X-P3ND")
        #expect(decoded["publicKey"] == "MFkwEwYHKoZIzj0CAQ==")
        #expect(decoded["deviceName"] == "Joao's iPhone")
        #expect(decoded["deviceModel"] == "iPhone17,1")
    }

    /// The three refusals, each as its own error. Collapsing them is the defect
    /// this test exists to catch: the recovery differs for every one.
    @Test(
        "each documented refusal maps to its own case",
        arguments: [
            (
                HTTPResponse.Status.badRequest,
                #"{"code":"invalid_request","message":"bad key"}"#,
                DevicePairingRefusal.invalidRequest
            ),
            (
                HTTPResponse.Status.forbidden,
                #"{"code":"pairing_rejected","message":"nope"}"#,
                DevicePairingRefusal.codeRejected
            ),
            (
                HTTPResponse.Status.tooManyRequests,
                #"{"code":"rate_limited","message":"slow down","retryAfterSeconds":42}"#,
                DevicePairingRefusal.rateLimited(retryAfterSeconds: 42)
            ),
        ])
    func documentedRefusalIsMapped(
        status: HTTPResponse.Status,
        json: String,
        expected: DevicePairingRefusal
    ) async throws {
        await #expect(throws: BFMClientError.pairingRefused(expected)) {
            try await pair(StubTransport(status: status, json: json))
        }
    }

    /// The case that motivates ``BFMClientError``: the generator models an
    /// undocumented status as a value, so without this mapping a 502 from a
    /// reverse proxy would arrive at a call site as a non-error.
    @Test("an undocumented status throws rather than returning")
    func undocumentedStatusThrows() async throws {
        await #expect(
            throws: BFMClientError.undocumentedResponse(
                operation: "device.pair", statusCode: 502)
        ) {
            try await pair(StubTransport(status: .badGateway, json: "{}"))
        }
    }

    /// The case the generated client hides.
    ///
    /// Its deserializer decodes eagerly, so a documented status carrying a body
    /// this contract cannot read never reaches the `switch` in `pairDevice` —
    /// it throws a `ClientError` from inside `device_pair`. That is not
    /// hypothetical: an intermediary in front of this BFM answers a rate limit
    /// with an HTML page, and without the mapping under test the person is told
    /// to check their connection while the server is telling them to wait.
    ///
    /// The status survives, and it is the half that decides what to do.
    @Test(
        "a documented status with an unreadable body still refuses for the right reason",
        arguments: [
            (HTTPResponse.Status.badRequest, DevicePairingRefusal.invalidRequest),
            (HTTPResponse.Status.forbidden, DevicePairingRefusal.codeRejected),
            (
                HTTPResponse.Status.tooManyRequests,
                DevicePairingRefusal.rateLimited(retryAfterSeconds: nil)
            ),
        ])
    func unreadableBodyOnDocumentedStatus(
        status: HTTPResponse.Status,
        expected: DevicePairingRefusal
    ) async throws {
        // What a rate-limiting proxy actually returns.
        let transport = StubTransport { _, _ in
            (
                HTTPResponse(status: status, headerFields: [.contentType: "text/html"]),
                HTTPBody("<html><body>Too many requests</body></html>")
            )
        }

        await #expect(throws: BFMClientError.pairingRefused(expected)) {
            try await pair(transport)
        }
    }

    /// The counterpart: an *undocumented* status with an unreadable body is a
    /// transport-shaped failure and must not be dressed up as a refusal.
    @Test("an unreadable body on an undocumented status is not turned into a refusal")
    func unreadableBodyOnUndocumentedStatusIsNotARefusal() async throws {
        let transport = StubTransport { _, _ in
            (
                HTTPResponse(status: .badGateway, headerFields: [.contentType: "text/html"]),
                HTTPBody("<html>502</html>")
            )
        }

        await #expect(
            throws: BFMClientError.undocumentedResponse(operation: "device.pair", statusCode: 502)
        ) {
            try await pair(transport)
        }
    }

    /// Nothing answered at all.
    ///
    /// Asserted rather than assumed, because the shape is not the obvious one:
    /// the generated client wraps whatever the transport threw in an
    /// `OpenAPIRuntime.ClientError`, so a caller matching on `URLError` — which
    /// is what a reader expects a dead network to produce — matches nothing.
    /// This is the whole reason `Auth` maps "not a documented refusal" to
    /// unreachable by exclusion instead of by naming the error it expects.
    ///
    /// What reaches the caller is `transportFailure` rather than the
    /// `ClientError` itself: that type renders `operationInput` by reflection,
    /// and this operation's input carries the pairing code. The summary keeps
    /// the diagnostic half — see ``BFMClientError``.
    ///
    /// It is also the assertion that the status-based mapping above does not
    /// overreach: nothing answered, so there is no status, and inventing a
    /// refusal from one would be worse than the misclassification that mapping
    /// exists to prevent.
    @Test("a transport failure reaches the caller as a summary, not as the raw error")
    func transportFailurePropagates() async throws {
        let transport = StubTransport { _, _ in throw StubTransportFailure() }

        let thrown = try #require(
            await #expect(throws: BFMClientError.self) { try await pair(transport) }
        )

        guard case .transportFailure(let operation, let summary) = thrown else {
            Issue.record("expected a transport failure, got \(thrown)")
            return
        }
        #expect(operation == "device.pair")
        #expect(summary.contains("StubTransportFailure"))
        #expect(summary.contains("no response"))
        #expect(!summary.contains("7QK4"), "the pairing code reached a rendered error")
    }

    /// The tokens exist in memory for as long as it takes to store them, and a
    /// single interpolation into a log line is all it takes to widen that.
    @Test("neither string conversion prints a token")
    func credentialsAreRedacted() async throws {
        let issued = try await pair(StubTransport(status: .created, json: Self.createdBody))

        for rendered in ["\(issued)", String(reflecting: issued), issued.debugDescription] {
            #expect(!rendered.contains("access-token"))
            #expect(!rendered.contains("refresh-token"))
        }
    }
}

internal struct StubTransportFailure: Error {}

/// Request bodies the stub saw, for the same reason ``RecordedRequests`` is an
/// actor: `ClientTransport.send` is non-mutating and `Sendable`.
internal actor RecordedBodies {
    internal private(set) var all: [Data] = []

    internal func append(_ body: Data) {
        all.append(body)
    }
}
