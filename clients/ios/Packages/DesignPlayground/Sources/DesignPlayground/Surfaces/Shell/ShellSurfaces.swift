import DesignSystem
import SwiftUI

/// The app's own root, staged as far as a package can reach.
///
/// `RootView`, `ContentView` and `RootCopy` live in `App`, not in a package
/// `DesignPlayground` can depend on, so the feature-routing switch, the real
/// `TabView` and the exact copy those files carry cannot be staged directly —
/// see ``ShellContentView``, ``ShellTabBarView`` and ``ShellCopy`` for what
/// is reconstructed in their place, from the ``AppCore`` types
/// (``RootDestination``, ``FeatureSurface``, ``BootstrapPhase``) that do ship
/// in a package, and why each should read the same as the thing it stands in
/// for.
///
/// `RootDestination.pairing` is deliberately not a state here: pairing is
/// `FeaturePairing`'s own screen, with its own surface, and `shell.tsx` — the
/// facsimile this replaces — never drew it under "App shell" either.
///
/// Chrome is ``Chrome/bare``: every other chrome wraps the surface in a tab
/// bar or a nav bar, and here the tab bar is the subject being reviewed, not
/// the frame around it. ``Chrome/tabbed`` would stack a second `TabView` on
/// top of the one these states build themselves.
@MainActor
internal enum ShellSurfaces {
    static let surfaces: [DesignSurface] = [
        DesignSurface(
            id: SurfaceID(area: "shell", slug: "root"),
            title: "App shell",
            synopsis:
                "What RootView shows: booting, a paired screen, and a stale or failed bootstrap.",
            chrome: .bare,
            states: [
                DesignState("launching", "Launching") {
                    Color.popsBackground.ignoresSafeArea()
                },
                DesignState.standard {
                    ShellContentView(degradation: .none)
                },
                DesignState("degraded-stale", "Degraded — stale") {
                    ShellContentView(degradation: .stale)
                },
                DesignState("degraded-failed", "Degraded — failed") {
                    ShellContentView(degradation: .failed)
                },
                DesignState("nothing-offered", "Nothing offered") {
                    ErrorStateView(message: ShellCopy.nothingOffered, retryTitle: ShellCopy.retry) {
                    }
                },
                DesignState("nothing-usable", "Nothing usable") {
                    ErrorStateView(message: ShellCopy.nothingUsable, retryTitle: ShellCopy.retry) {}
                },
                DesignState("tabs-4", "Tab bar — four features") {
                    ShellTabBarView(count: 4)
                },
                DesignState("tabs-3", "Tab bar — three features") {
                    ShellTabBarView(count: 3)
                },
                DesignState("tabs-2", "Tab bar — two features") {
                    ShellTabBarView(count: 2)
                },
                DesignState("tabs-1", "One feature — no bar") {
                    ShellTabBarView(count: 1)
                },
            ]
        )
    ]
}
