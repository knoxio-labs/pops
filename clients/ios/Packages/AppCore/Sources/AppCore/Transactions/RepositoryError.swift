/// What a repository call can fail with, in terms a screen can act on.
///
/// Shared across every repository seam in ``AppCore`` rather than one enum
/// per feature — whether the server is down, the session ended, a response
/// cannot be read or a request was rejected does not change with the domain
/// behind the call, so a second copy would only be a second set of cases to
/// keep in step with this one.
public enum RepositoryError: Error, Hashable, Sendable {
    /// The pillar behind this call is down and said so. Distinct from an
    /// empty result, which means there is genuinely nothing — rendering "you
    /// have no transactions" because finance is unreachable is a lie.
    case unavailable
    /// Credentials were rejected. The session is on its way to `revoked`.
    case unauthorized
    /// The server asked the caller to wait before sending another read.
    /// `retryAfterSeconds` is nil when the response had no readable wait value.
    case rateLimited(retryAfterSeconds: Int?)
    /// The response did not match what this build expects. An old app meeting a
    /// newer contract lands here rather than showing half a screen.
    case contractMismatch
    /// The server rejected a request from this build. Sending the same request
    /// again cannot succeed; an app and server contract mismatch is a likely cause.
    case requestRejected
    /// The write collided with something already on file: a repeated idempotency key, or a
    /// receipt whose checksum already belongs to a purchase. The payload preserves the server's
    /// machine-readable reason for domain-specific recovery. Retrying the same input cannot get
    /// past a conflict, unlike a transport failure.
    case conflict(String)
    /// The request never got an answer. The payload is a diagnostic, not
    /// something to show a user.
    case transport(RepositoryTransportError)
    /// The composition root never bound an implementation. Reachable only
    /// through ``AppDependencies/unbound``.
    case dependencyNotBound

    /// Preserves the source-compatible string constructor used by existing repositories.
    public static func transport(_ diagnostic: String) -> RepositoryError {
        .transport(RepositoryTransportError(diagnostic: diagnostic))
    }

    /// Carries a structured runtime failure through the established transport case.
    public static func transport(_ popsError: PopsError) -> RepositoryError {
        .transport(RepositoryTransportError(popsError: popsError))
    }
}

/// The diagnostic payload retained by ``RepositoryError/transport(_:)``.
public struct RepositoryTransportError: Hashable, Sendable, CustomStringConvertible {
    /// A credential-free diagnostic retained for compatibility with existing logging.
    public let diagnostic: String
    /// The structured failure, when the runtime could classify one safely.
    public let popsError: PopsError?

    /// Creates a legacy diagnostic payload.
    public init(diagnostic: String) {
        self.diagnostic = diagnostic
        self.popsError = nil
    }

    /// Creates a payload backed by a structured POPS failure.
    public init(popsError: PopsError) {
        self.diagnostic = popsError.code
        self.popsError = popsError
    }

    /// The credential-free diagnostic used for string interpolation.
    public var description: String { diagnostic }

    /// Returns whether the credential-free diagnostic contains a string.
    public func contains(_ other: String) -> Bool {
        diagnostic.contains(other)
    }
}
