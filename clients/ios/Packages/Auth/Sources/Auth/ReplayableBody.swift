import OpenAPIRuntime

/// A request body that a retry can send again — or an honest statement that it
/// cannot.
///
/// `HTTPBody` is an async sequence, and the ones that matter here are
/// single-pass: reading it to send the request consumes it, so the obvious
/// implementation of "retry after refreshing" sends a second request with an
/// empty body. The far side answers `400` and the app reports it as a refused
/// request, which is a bug that only appears once a `/mobile` route takes a
/// body and never in a test written against the GET-only surface that exists
/// today.
///
/// Three cases, and the third is the one worth stating out loud:
///
/// - **Re-iterable.** `HTTPBody` says so itself. Every body the generated
///   client builds from encoded JSON is in this class, which is why the common
///   path costs nothing.
/// - **Buffered.** Single-pass but of known, small length: read once, kept, and
///   handed out fresh per attempt.
/// - **One-shot.** Single-pass and either unbounded or larger than the cap.
///   There is no way to replay it that does not mean holding an arbitrary
///   upload in memory, so this type refuses to pretend — ``isReplayable`` is
///   `false` and the middleware escalates the `401` instead of retrying it. A
///   failed upload the caller can retry beats an upload silently truncated to
///   nothing.
internal struct ReplayableBody: Sendable {
    private enum Storage: Sendable {
        case absent
        case reiterable(HTTPBody)
        case buffered(ArraySlice<UInt8>)
        case oneShot(HTTPBody)
    }

    /// Bodies above this are not held. No `/mobile` route sends one at all
    /// today, so this bounds a case that does not yet exist; it is here so the
    /// day one does, the failure is a refusal to buffer rather than a phone
    /// holding a video in memory to make a retry possible.
    internal static let maximumBufferedBytes = 1 << 20

    private let storage: Storage

    internal init(capturing body: HTTPBody?) async throws {
        guard let body else {
            storage = .absent
            return
        }
        guard body.iterationBehavior == .single else {
            storage = .reiterable(body)
            return
        }
        guard case .known(let length) = body.length, length <= Int64(Self.maximumBufferedBytes)
        else {
            storage = .oneShot(body)
            return
        }
        storage = .buffered(try await ArraySlice(collecting: body, upTo: Int(length)))
    }

    /// Whether a second attempt can carry the same bytes.
    internal var isReplayable: Bool {
        if case .oneShot = storage { return false }
        return true
    }

    /// The body for one attempt. Call once per attempt, not once per request.
    internal func body() -> HTTPBody? {
        switch storage {
        case .absent: nil
        case .reiterable(let body), .oneShot(let body): body
        case .buffered(let bytes): HTTPBody(bytes)
        }
    }
}
