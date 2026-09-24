import AppCore

/// Whether `ContentView`'s degraded banner should still be on screen, given
/// the bootstrap phase and the last phase a person dismissed.
///
/// Extracted from the view so "should this still be showing" is a fact a test
/// can check without mounting anything — the same reasoning `PopsButton`
/// exposes its `action` for. Held as `@State` on `ContentView`, this is what
/// makes the banner dismissable while a rehearsal's own bootstrap failure is
/// still ongoing, without inventing a timer or a second flag that a later
/// bootstrap answer would have to remember to clear.
///
/// A dismissal only ever silences the phase it was made for. The phase is a
/// value, not a boolean, precisely so that a *different* failure — the
/// registry recovering and then failing again with a new `RepositoryError`,
/// or a stale answer degrading into a genuinely failed one — is not mistaken
/// for the one already dismissed and shown again.
internal struct DegradedBannerVisibility: Equatable {
    private var dismissedPhase: BootstrapPhase?

    internal init() {}

    /// Whether the banner belongs on screen for `phase`.
    internal func isVisible(for phase: BootstrapPhase) -> Bool {
        phase.isDegraded && phase != dismissedPhase
    }

    /// Silences the banner for exactly this phase.
    internal mutating func dismiss(_ phase: BootstrapPhase) {
        dismissedPhase = phase
    }

    /// Forgets any dismissal. Called once the bootstrap phase recovers, so
    /// the *same* failure recurring later — the common case for a Watchtower
    /// blip, which always fails the same way — is not mistaken for the one
    /// already dismissed and silenced for good. `isVisible(for:)` cannot do
    /// this itself: it is read from `ContentView.body`, a non-mutating
    /// computed property, so the reset is `ContentView`'s own `onChange` of
    /// `surface.bootstrap` rather than a side effect of the query.
    internal mutating func reset() {
        dismissedPhase = nil
    }
}
