/// A place a feature reports that it just reached the backend on its own,
/// independent of whatever ``AppShellModel``'s own bootstrap call last found.
///
/// Bootstrap and a feature's own repository calls are separate conversations
/// with the BFM: one failing says nothing about whether the other will.
/// A feature succeeding while bootstrap's last answer is
/// ``BootstrapPhase/failed(_:)`` is real evidence that failure is stale — the
/// one signal ``AppShellModel/reloadBootstrap()``'s own "never on a schedule"
/// rule was not written against, because nothing else in this module makes a
/// request of its own to notice.
public protocol ReachabilityWitness: Sendable {
    /// Something else in the app just completed a successful request.
    ///
    /// A conformer must return promptly — whatever it decides to do about
    /// this is its own concern, never the caller's to wait on. The caller is
    /// typically a fetch's own success path, and its completion (a pull to
    /// refresh finishing, say) must not end up gated on a retry this triggers
    /// somewhere else.
    func noteReachable() async
}
