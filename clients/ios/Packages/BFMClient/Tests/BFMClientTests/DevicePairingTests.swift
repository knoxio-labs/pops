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

    /// Nothing answered at all.
    ///
    /// Asserted rather than assumed, because the shape is not the obvious one:
    /// the generated client wraps whatever the transport threw in an
    /// `OpenAPIRuntime.ClientError`, so a caller matching on `URLError` — which
    /// is what a reader expects a dead network to produce — matches nothing.
    /// This is the whole reason `Auth` maps "not a documented refusal" to
    /// unreachable by exclusion instead of by naming the error it expects.
    @Test("a transport failure reaches the caller, wrapped by the generated client")
    func transportFailurePropagates() async throws {
        let transport = StubTransport { _, _ in throw StubTransportFailure() }

        let thrown = await #expect(throws: ClientError.self) { try await pair(transport) }

        #expect(try #require(thrown).underlyingError is StubTransportFailure)
        #expect(!(thrown is BFMClientError))
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
