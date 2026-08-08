import Foundation
import OpenAPIRuntime
import OpenAPIURLSession

/// A response the contract does not describe.
///
/// The generated client turns any undocumented status into a `.undocumented`
/// case rather than an error, which is the right default for a generator and
/// the wrong one for a caller: it makes "the BFM returned 502" indistinguishable
/// from a successful call whose body nobody looked at. Every such case is
/// converted here.
public enum BFMClientError: Error, Hashable, Sendable {
    /// A status code the OpenAPI snapshot does not document for this operation.
    case undocumentedResponse(operation: String, statusCode: Int)

    /// The BFM answered a documented refusal. Carried as an error rather than
    /// returned, so a caller that ignores the distinction cannot mistake a
    /// refusal for a paired device.
    case pairingRefused(DevicePairingRefusal)
}

/// The BFM, as this app calls it.
///
/// One instance per base URL. Where that URL comes from is
/// ``BuiltInBaseURL``'s problem in Debug and the pairing store's in Release —
/// this type is handed one and does not go looking.
///
/// Carries no credentials. Attaching and refreshing an access token is a
/// `ClientMiddleware` this module does not have yet, which is why the only
/// operations exposed below are the two the BFM answers unauthenticated —
/// `GET /health` and the pairing exchange, which is unauthenticated by
/// definition because it is where a device's credentials come from. Adding an
/// authenticated call means adding that middleware first, not adding a header
/// at a call site.
///
/// The generated client also carries the contract's `/operator/*` operations.
/// They are not surfaced here and never will be: that perimeter is fronted by
/// Cloudflare Access and answers a browser, not a phone.
public struct BFMHTTPClient: Sendable {
    private let generated: Client

    /// - Parameter baseURL: The BFM's origin. Paths from the contract are
    ///   appended to it, so a trailing path component here becomes a prefix on
    ///   every request.
    public init(baseURL: URL) {
        self.init(baseURL: baseURL, transport: URLSessionTransport())
    }

    /// The seam every test uses, and the reason none of them stub `URLProtocol`.
    /// `internal` because a caller choosing its own transport is choosing its
    /// own timeouts, redirect policy and TLS behaviour — decisions that belong
    /// to this module, not to a screen.
    internal init(baseURL: URL, transport: any ClientTransport) {
        generated = Client(serverURL: baseURL, transport: transport)
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
    ///   anything else the BFM said, and the transport's own error when nothing
    ///   answered.
    public func pairDevice(
        code: String,
        publicKeyBase64DER: String,
        deviceName: String,
        deviceModel: String
    ) async throws -> IssuedDeviceCredentials {
        let output = try await generated.device_pair(
            body: .json(
                .init(
                    code: code,
                    deviceModel: deviceModel,
                    deviceName: deviceName,
                    publicKey: publicKeyBase64DER
                )
            )
        )

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
}
