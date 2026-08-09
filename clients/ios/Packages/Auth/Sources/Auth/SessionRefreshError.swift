import AppCore

/// Why a refresh did not produce a usable token pair.
///
/// Four cases, and the split that matters is the last one against the other
/// three: ``unavailable`` is the only failure after which the credentials on
/// this device are still worth something. Everything else has ended the
/// session, and ``sessionEvent`` is where that is written down once rather than
/// re-decided at each call site.
///
/// No case carries an underlying `Error`, and `unavailable`'s payload is a
/// string built by `BFMClient`, which has already reduced the runtime's error
/// to the part that cannot contain a credential. That is deliberate: an error
/// value that renders a token is one `"\(error)"` away from a log line, and the
/// `"\(error)"` looks entirely ordinary in review.
public enum SessionRefreshError: Error, Equatable {
    /// There was nothing to refresh — this device is unpaired, or its
    /// credentials were wiped while the request was in flight.
    case unauthenticated

    /// The BFM refused the grant, or the successor it issued could not be
    /// stored. Both end the same way: this device cannot recover without
    /// pairing again.
    ///
    /// The BFM collapses unknown, expired, revoked, already-spent and
    /// wrong-signature into one response on purpose, so nothing here may claim
    /// to know which of them happened.
    case credentialsRejected

    /// An operator revoked this device. Its credentials have been destroyed.
    case deviceRevoked

    /// The refresh did not complete: no network, a rate limit, a proxy, a
    /// server fault. **Nothing was destroyed and the session did not move** —
    /// the next request tries again with the credentials still in place.
    ///
    /// This is the case that has to stay wide. A `401` or `403` whose body this
    /// build could not read arrives here rather than as a refusal, because the
    /// alternative is that one misapplied edge policy signs every handset in
    /// the field out at once.
    case unavailable(String)
}

extension SessionRefreshError {
    /// What this failure did to the session, or `nil` when it did nothing.
    ///
    /// A single table rather than a branch per call site: the difference
    /// between "the session ended" and "that request failed" is the whole of
    /// what a screen needs, and deriving it twice is how the two answers end up
    /// disagreeing.
    public var sessionEvent: SessionEvent? {
        switch self {
        case .unauthenticated, .credentialsRejected: .revoked(.credentialsRejected)
        case .deviceRevoked: .revoked(.revokedByOperator)
        case .unavailable: nil
        }
    }
}

extension SessionRefreshError: CustomStringConvertible {
    public var description: String {
        switch self {
        case .unauthenticated: "no credentials to refresh"
        case .credentialsRejected: "the BFM refused this device's grant"
        case .deviceRevoked: "this device has been revoked"
        case .unavailable(let summary): "refresh unavailable (\(summary))"
        }
    }
}
