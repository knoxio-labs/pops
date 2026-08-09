import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession

/// The BFM, as this app calls it.
///
/// One instance per base URL. Where that URL comes from is
/// ``BuiltInBaseURL``'s problem in Debug and the pairing store's in Release —
/// this type is handed one and does not go looking.
///
/// Carries no credentials of its own. An instance built with ``init(baseURL:)``
/// can only reach what the BFM answers unauthenticated — `GET /health`, the
/// pairing exchange, and the challenge/refresh pair, all of which either
/// predate having a token or exist because the one the device had stopped
/// working. Reaching a `/mobile/*` operation means handing this type a
/// middleware that attaches one; `Auth` has the only implementation.
///
/// The generated client also carries the contract's `/operator/*` operations.
/// They are not surfaced here and never will be: that perimeter is fronted by
/// Cloudflare Access and answers a browser, not a phone.
public struct BFMHTTPClient: Sendable {
    /// `internal` rather than `private` only so the operations can be split
    /// across files as the surface grows — `DeviceRefresh.swift` is the second
    /// one. The type it names is itself `internal`, so this widens nothing
    /// outside this module.
    internal let generated: Client

    /// - Parameter baseURL: The BFM's origin. Paths from the contract are
    ///   appended to it, so a trailing path component here becomes a prefix on
    ///   every request.
    public init(baseURL: URL) {
        self.init(baseURL: baseURL, middlewares: [])
    }

    /// The authenticated variant.
    ///
    /// A middleware is the seam rather than the transport, and the difference
    /// is which decisions the caller takes over. A middleware runs *around*
    /// the transport: it may read and rewrite the request and the response, and
    /// it may send the request more than once — which is the whole of what
    /// attaching and refreshing a token needs. It cannot choose the timeouts,
    /// the redirect policy or the TLS behaviour, because it never performs the
    /// call. Those stay here, where they belong.
    ///
    /// - Parameter middlewares: Invoked in order before the transport, and in
    ///   reverse on the way back, per `swift-openapi-runtime`.
    public init(baseURL: URL, middlewares: [any ClientMiddleware]) {
        self.init(baseURL: baseURL, transport: URLSessionTransport(), middlewares: middlewares)
    }

    /// The seam every test uses, and the reason none of them stub `URLProtocol`.
    /// `internal` because a caller choosing its own transport is choosing its
    /// own timeouts, redirect policy and TLS behaviour — decisions that belong
    /// to this module, not to a screen. The public initialiser above hands out
    /// the half of that seam which carries none of those decisions with it.
    internal init(
        baseURL: URL,
        transport: any ClientTransport,
        middlewares: [any ClientMiddleware] = []
    ) {
        generated = Client(serverURL: baseURL, transport: transport, middlewares: middlewares)
    }

    /// Asks the BFM whether it is alive.
    ///
    /// Answers without a database round-trip on the far side, so a timeout here
    /// means the network or the process, never a slow query.
    public func health() async throws -> BFMHealth {
        let output = try await generated.health()
        switch output {
        case .ok(let ok):
            let payload = try ok.body.json
            return BFMHealth(
                pillar: payload.pillar.rawValue,
                version: payload.version,
                reportedAt: payload.ts
            )
        case .undocumented(let statusCode, _):
            throw BFMClientError.undocumentedResponse(
                operation: Operations.Health.id,
                statusCode: statusCode
            )
        }
    }

    /// Spends a pairing code for this device's identity.
    ///
    /// - Parameters:
    ///   - code: The code as the QR carried it or the operator read it out. The
    ///     BFM normalises grouping and case on its side, so this is passed
    ///     through rather than reshaped here.
    ///   - publicKeyBase64DER: Base64 of the SPKI/DER encoding of the device's
    ///     P-256 public key. `Auth`'s `DevicePublicKey` produces exactly this;
    ///     assembling it anywhere else is how the two ends of the exchange end
    ///     up disagreeing about a byte and failing as a 401 much later.
    ///   - deviceName: Operator-facing label.
    ///   - deviceModel: Hardware identifier, e.g. `iPhone17,1`.
    /// - Throws: ``BFMClientError/pairingRefused(_:)`` for a documented refusal,
    ///   ``BFMClientError/undocumentedResponse(operation:statusCode:)`` for
    ///   anything else the BFM said, and
    ///   ``BFMClientError/transportFailure(operation:summary:)`` when the call
    ///   did not complete.
    public func pairDevice(
        code: String,
        publicKeyBase64DER: String,
        deviceName: String,
        deviceModel: String
    ) async throws -> IssuedDeviceCredentials {
        let output: Operations.Device_pair.Output
        do {
            output = try await generated.device_pair(
                body: .json(
                    .init(
                        code: code,
                        deviceModel: deviceModel,
                        deviceName: deviceName,
                        publicKey: publicKeyBase64DER
                    )
                )
            )
        } catch let error as ClientError {
            throw Self.pairingFailure(error)
        }

        switch output {
        case .created(let created):
            let payload = try created.body.json
            return IssuedDeviceCredentials(
                deviceId: payload.deviceId,
                accessToken: payload.accessToken,
                refreshToken: payload.refreshToken,
                expiresInSeconds: payload.expiresIn
            )
        case .badRequest:
            throw BFMClientError.pairingRefused(.invalidRequest)
        case .forbidden:
            throw BFMClientError.pairingRefused(.codeRejected)
        case .tooManyRequests(let limited):
            throw BFMClientError.pairingRefused(
                .rateLimited(retryAfterSeconds: try limited.body.json.retryAfterSeconds)
            )
        case .undocumented(let statusCode, _):
            throw BFMClientError.undocumentedResponse(
                operation: Operations.Device_pair.id,
                statusCode: statusCode
            )
        }
    }

    /// The refusal a documented status means, for a response whose *body* the
    /// generated client could not read.
    ///
    /// The generated deserializer decodes eagerly, so a `429` carrying an HTML
    /// rate-limit page — which is what an intermediary in front of this BFM
    /// returns, and there is one — never reaches the `switch` above. It throws
    /// a `ClientError` from inside `device_pair`, and without this that becomes
    /// indistinguishable from a dead network: `Auth` maps anything it does not
    /// recognise to `unreachable`, so the person is told to check their
    /// connection while the server is telling them to wait.
    ///
    /// The status is the actionable half and it is intact. `nil` for anything
    /// this contract does not document, including the no-response case, because
    /// those genuinely are transport failures.
    private static func pairingFailure(_ error: ClientError) -> BFMClientError {
        guard let refusal = refusal(readableFrom: error.response) else {
            return .transportFailure(error, operation: Operations.Device_pair.id)
        }
        return .pairingRefused(refusal)
    }

    private static func refusal(readableFrom response: HTTPResponse?) -> DevicePairingRefusal? {
        switch response?.status.code {
        case 400: .invalidRequest
        case 403: .codeRejected
        case 429: .rateLimited(retryAfterSeconds: nil)
        default: nil
        }
    }
}
