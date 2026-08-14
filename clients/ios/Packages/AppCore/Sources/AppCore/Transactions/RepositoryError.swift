/// What a repository call can fail with, in terms a screen can act on.
///
/// Shared across every repository seam in ``AppCore`` rather than one enum
/// per feature — the failure modes a screen has to render around (the pillar
/// is down, the session is gone, the response does not match this build) do
/// not change shape with the domain behind the call, so a second copy would
/// only be a second set of cases to keep in step with this one.
public enum RepositoryError: Error, Hashable, Sendable {
    /// The pillar behind this call is down and said so. Distinct from an
    /// empty result, which means there is genuinely nothing — rendering "you
    /// have no transactions" because finance is unreachable is a lie.
    case unavailable
    /// Credentials were rejected. The session is on its way to `revoked`.
    case unauthorized
    /// The response did not match what this build expects. An old app meeting a
    /// newer contract lands here rather than showing half a screen.
    case contractMismatch
    /// The request never got an answer. The payload is a diagnostic, not
    /// something to show a user.
    case transport(String)
    /// The composition root never bound an implementation. Reachable only
    /// through ``AppDependencies/unbound``.
    case dependencyNotBound
}
