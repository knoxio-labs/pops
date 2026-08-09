import HTTPTypes
import OpenAPIRuntime

/// The nonce a refresh is signed over.
///
/// Opaque: the only valid thing to do with ``nonce`` is fold it into the signed
/// message and echo it back. ``expiresInSeconds`` is here so a caller holding
/// one already can decide whether it is still worth trying, rather than finding
/// out by spending a refresh token against it.
public struct RefreshChallenge: Sendable, Equatable {
    public let nonce: String
    /// Seconds the nonce stays spendable, counted from this response.
    public let expiresInSeconds: Int

    public init(nonce: String, expiresInSeconds: Int) {
        self.nonce = nonce
        self.expiresInSeconds = expiresInSeconds
    }
}

/// What a successful rotation hands back.
///
/// The presented refresh token is already dead by the time this exists, and
/// ``refreshToken`` is the only copy of its successor — a response that reaches
/// this type and is then dropped costs a fresh pairing code, exactly as at
/// pairing. No `deviceId`: the device already holds one, and a second source
/// for it would be a value that can disagree with itself.
public struct RefreshedSession: Sendable, Equatable {
    public let accessToken: String
    public let refreshToken: String
    /// Seconds the access token stays valid, counted from this response.
    public let expiresInSeconds: Int

    public init(accessToken: String, refreshToken: String, expiresInSeconds: Int) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.expiresInSeconds = expiresInSeconds
    }
}

// Same treatment as `IssuedDeviceCredentials`, for the same reason: this is
// where a token pair exists, and a single interpolation is all it takes to
// print one.
extension RefreshedSession: CustomStringConvertible, CustomDebugStringConvertible {
    public var description: String { "RefreshedSession(redacted)" }
    public var debugDescription: String { "RefreshedSession(redacted)" }
}

/// Why the BFM refused a challenge or a refresh.
///
/// Five cases because they select four different recoveries, and two of them
/// are destructive:
///
/// - ``challengeExpired`` — the nonce was unknown, spent or stale. Nothing is
///   wrong with the credential; fetch another and retry once.
/// - ``invalidGrant`` — the refresh token or the signature did not hold. The
///   BFM collapses unknown, expired, revoked, already-spent and wrong-key into
///   this one value deliberately, so nothing downstream may claim to know
///   which. The recovery is to pair again.
/// - ``deviceRevoked`` — an operator cut this handset off. Pair again *and*
///   destroy what is on the device.
/// - ``invalidRequest`` — this app built a request the BFM does not accept. Its
///   own defect; no retry fixes it.
/// - ``rateLimited`` — back off and try the same request again.
public enum DeviceRefreshRefusal: Hashable, Sendable {
    case challengeExpired
    case invalidGrant
    case deviceRevoked
    case invalidRequest
    /// `nil` when the status arrived without a body this contract can read.
    case rateLimited(retryAfterSeconds: Int?)
}

extension BFMHTTPClient {
    /// Asks for a single-use nonce to sign the next refresh over.
    ///
    /// Carries no credential and needs none — the value is worthless without a
    /// live refresh token and the device's Enclave key.
    public func challenge() async throws -> RefreshChallenge {
        let output: Operations.Device_challenge.Output
        do {
            output = try await generated.device_challenge()
        } catch let error as ClientError {
            throw Self.refreshFailure(error, operation: Operations.Device_challenge.id)
        }

        switch output {
        case .created(let created):
            let payload = try created.body.json
            return RefreshChallenge(nonce: payload.nonce, expiresInSeconds: payload.expiresIn)
        case .badRequest:
            throw BFMClientError.refreshRefused(.invalidRequest)
        case .tooManyRequests(let limited):
            throw BFMClientError.refreshRefused(
                .rateLimited(retryAfterSeconds: try limited.body.json.retryAfterSeconds)
            )
        case .undocumented(let statusCode, _):
            throw BFMClientError.undocumentedResponse(
                operation: Operations.Device_challenge.id,
                statusCode: statusCode
            )
        }
    }

    /// Spends a refresh token for its successor, proving possession of the
    /// device key.
    ///
    /// - Parameters:
    ///   - refreshToken: The token as the device stored it.
    ///   - nonce: From ``challenge()``, unmodified.
    ///   - signatureBase64: Base64 of the ASN.1 DER ECDSA P-256 signature over
    ///     the message defined in `pillars/bfm/src/api/auth/refresh-exchange.ts`.
    ///     `Auth` builds those bytes; assembling them anywhere else is how the
    ///     two ends end up signing different things and failing as a `401`.
    /// - Throws: ``BFMClientError/refreshRefused(_:)`` for a documented refusal,
    ///   ``BFMClientError/undocumentedResponse(operation:statusCode:)`` for a
    ///   status the contract does not describe, and
    ///   ``BFMClientError/transportFailure(operation:summary:)`` when the call
    ///   did not complete. Never an `OpenAPIRuntime.ClientError`: that type
    ///   renders this operation's input, which is the refresh token and the
    ///   signature.
    public func refresh(
        refreshToken: String,
        nonce: String,
        signatureBase64: String
    ) async throws -> RefreshedSession {
        let output: Operations.Device_refresh.Output
        do {
            output = try await generated.device_refresh(
                body: .json(
                    .init(nonce: nonce, refreshToken: refreshToken, signature: signatureBase64)
                )
            )
        } catch let error as ClientError {
            throw Self.refreshFailure(error, operation: Operations.Device_refresh.id)
        }

        switch output {
        case .ok(let ok):
            let payload = try ok.body.json
            return RefreshedSession(
                accessToken: payload.accessToken,
                refreshToken: payload.refreshToken,
                expiresInSeconds: payload.expiresIn
            )
        case .badRequest:
            throw BFMClientError.refreshRefused(.invalidRequest)
        case .unauthorized(let refused):
            throw BFMClientError.refreshRefused(Self.refusal(for: try refused.body.json.code))
        case .forbidden:
            throw BFMClientError.refreshRefused(.deviceRevoked)
        case .tooManyRequests(let limited):
            throw BFMClientError.refreshRefused(
                .rateLimited(retryAfterSeconds: try limited.body.json.retryAfterSeconds)
            )
        case .undocumented(let statusCode, _):
            throw BFMClientError.undocumentedResponse(
                operation: Operations.Device_refresh.id,
                statusCode: statusCode
            )
        }
    }

    /// The two recoveries a `401` selects between, as the contract names them.
    private static func refusal(
        for code: Operations.Device_refresh.Output.Unauthorized.Body.JsonPayload.CodePayload
    ) -> DeviceRefreshRefusal {
        switch code {
        case .challengeExpired: .challengeExpired
        case .invalidGrant: .invalidGrant
        }
    }

    private static func refreshFailure(
        _ error: ClientError,
        operation: String
    ) -> BFMClientError {
        guard let refusal = refusal(readableFrom: error.response) else {
            return .transportFailure(error, operation: operation)
        }
        return .refreshRefused(refusal)
    }

    /// The refusal a status means, for a response whose *body* the generated
    /// client could not read — the case `BFMHTTPClient.pairDevice` documents,
    /// caused by an intermediary answering with HTML this contract cannot
    /// decode.
    ///
    /// **401 and 403 are deliberately absent, and that is the whole point of
    /// this being a separate table from pairing's.** On the pairing route,
    /// inferring `codeRejected` from a bare `403` costs someone one retyped
    /// code. Here the same inference costs the device its identity: a `401`
    /// read as `invalidGrant` and a `403` read as `deviceRevoked` both end in
    /// re-pairing, and one of them wipes the keychain first. Cloudflare Access
    /// answers exactly those two statuses with exactly such a page, and this
    /// BFM's device surface is one misapplied Access policy away from serving
    /// them to every handset in the field at once.
    ///
    /// So a status whose meaning cannot be destructive is mapped, and the two
    /// that can are left to surface as the transport failure they are
    /// indistinguishable from. `Auth` retries a transport failure and revokes
    /// nothing, which is the safe way to be wrong here.
    private static func refusal(readableFrom response: HTTPResponse?) -> DeviceRefreshRefusal? {
        switch response?.status.code {
        case 400: .invalidRequest
        case 429: .rateLimited(retryAfterSeconds: nil)
        default: nil
        }
    }
}
