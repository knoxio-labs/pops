import AppCore
import Testing

@testable import Pops

/// `ContentView`'s degraded banner used to have no dismiss at all: it was
/// purely derived from `BootstrapPhase.isDegraded`, so a Watchtower blip that
/// healed itself in a few seconds (POPS-3731) left it on screen — occupying
/// the top of the screen with no way to get rid of it — for the rest of a
/// foregrounded session, since nothing re-polls on a timer by design. These
/// tests cover the decision on its own, without mounting a view.
@Suite("Degraded banner visibility")
internal struct DegradedBannerVisibilityTests {
    @Test("a fresh visibility shows for any degraded phase")
    func showsByDefault() {
        let visibility = DegradedBannerVisibility()

        #expect(visibility.isVisible(for: .failed(.unavailable)))
        #expect(visibility.isVisible(for: .answered(.staleFallback)))
    }

    @Test("a phase that is not degraded never shows, dismissed or not")
    func neverShowsForACurrentAnswer() {
        var visibility = DegradedBannerVisibility()

        #expect(!visibility.isVisible(for: .answered(.fresh)))

        visibility.dismiss(.failed(.unavailable))
        #expect(!visibility.isVisible(for: .answered(.fresh)))
    }

    @Test("dismissing the phase on screen hides it")
    func dismissHidesTheCurrentPhase() {
        var visibility = DegradedBannerVisibility()
        let phase = BootstrapPhase.failed(.unavailable)
        #expect(visibility.isVisible(for: phase))

        visibility.dismiss(phase)

        #expect(!visibility.isVisible(for: phase))
    }

    /// The bug a boolean flag would have reintroduced: dismissing today's
    /// failure must not silently swallow a *different* one that shows up
    /// later, including the same `RepositoryError` recurring after a
    /// successful bootstrap in between.
    @Test("dismissing one failure does not hide a later, different one")
    func dismissalDoesNotCarryToADifferentFailure() {
        var visibility = DegradedBannerVisibility()
        visibility.dismiss(.failed(.unavailable))

        #expect(visibility.isVisible(for: .failed(.transport("dead"))))
        #expect(visibility.isVisible(for: .answered(.staleFallback)))
    }

    /// `ContentView` calls `reset()` from its `onChange(of: surface.bootstrap)`
    /// once a phase stops being degraded — this is that contract, proven on
    /// the type alone: without it, a Watchtower blip that always fails the
    /// same way (`RepositoryError.unavailable`, say) would be dismissable
    /// exactly once per app launch.
    @Test("the same failure recurring after reset shows again")
    func recurrenceAfterResetShowsAgain() {
        var visibility = DegradedBannerVisibility()
        let phase = BootstrapPhase.failed(.unavailable)
        visibility.dismiss(phase)
        #expect(!visibility.isVisible(for: phase))

        visibility.reset()

        #expect(visibility.isVisible(for: phase))
    }
}
