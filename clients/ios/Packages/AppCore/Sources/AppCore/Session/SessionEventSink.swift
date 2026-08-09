/// How code that is not on the main actor moves the session.
///
/// ``SessionStore`` is `@MainActor` because it is what a view observes, and the
/// two things that end a session — a `403` on any request, a refresh the BFM
/// refuses — are discovered by a network call on some other executor. Without a
/// seam, every such caller would hold the store and hop to the main actor
/// itself, which is a `MainActor.run` at each site and a different set of
/// assumptions at each one.
///
/// `async` in the requirement rather than a fire-and-forget `nonisolated func`,
/// so the caller can await the transition before deciding what to do next — the
/// difference between "the session is revoked" and "a task that will revoke the
/// session has been started", which is exactly the distinction a test of the
/// revocation path needs to be able to make.
public protocol SessionEventSink: Sendable {
    func send(_ event: SessionEvent) async
}

/// The real sink. `SessionStore.send` is synchronous and main-actor-isolated,
/// which Swift accepts as the witness for an `async` requirement — the hop is
/// the `await` at the call site, and there is no second implementation to keep
/// in step with the first.
extension SessionStore: SessionEventSink {}
