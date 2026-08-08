/// What reading data can fail with, in terms a screen can act on.
public enum RepositoryError: Error, Hashable, Sendable {
    /// The pillar behind this data is down and said so. Distinct from an empty
    /// page, which means there is genuinely nothing — rendering "you have no
    /// transactions" because finance is unreachable is a lie.
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
