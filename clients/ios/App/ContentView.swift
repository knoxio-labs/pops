import AppCore
import DesignSystem
import FeatureReceiptCapture
import FeatureTransactions
import SwiftUI

/// The paired app: whatever the BFM said is reachable, and an honest sentence
/// when that is nothing.
///
/// The mapping from a feature id to a screen is here and only here. A feature
/// module names the id it draws; this decides what "drawing" it means, which is
/// what stops one feature from having to construct another's views.
///
/// Between features, this draws exactly one piece of navigation chrome — a tab
/// bar — and only once there is more than one feature to move between. It
/// draws none inside a feature: a feature that has more than one screen brings
/// its own `NavigationStack` — `TransactionsFlowView` is the first — because
/// the routes between those screens belong to that feature and resolving them
/// here would mean this file naming every screen in the app. A stack around a
/// stack is also simply broken: the inner one wins and the outer one silently
/// does nothing.
internal struct ContentView: View {
    internal let surface: FeatureSurface
    internal let shell: AppShellModel
    internal let composition: AppComposition

    internal var body: some View {
        VStack(spacing: PopsSpacing.zero) {
            degradedBanner
            features
        }
    }

    /// Every available feature, in the BFM's order.
    ///
    /// Zero gets the explanation below. Exactly one fills the screen outright —
    /// the shipped single-feature look, unchanged, because a tab bar with one
    /// tab is chrome nobody asked for. Two or more get a `TabView`, one tab per
    /// feature: `TabView` with no explicit `selection` binding manages which
    /// tab is showing on its own, including what happens when a reload changes
    /// the list out from under it, which is one thing fewer this file has to
    /// get right.
    @ViewBuilder private var features: some View {
        switch surface.available.count {
        case 0:
            unavailableExplanation
        case 1:
            screen(for: surface.available[0])
        default:
            TabView {
                ForEach(surface.available, id: \.self) { feature in
                    screen(for: feature)
                        .tabItem {
                            Label(RootCopy.name(of: feature), systemImage: RootCopy.symbol(for: feature))
                        }
                        .tag(feature)
                }
            }
        }
    }

    /// A feature is asked for its whole flow, not for one of its screens. What
    /// the routes inside it mean is the feature's own business — this only
    /// decides which feature is on screen.
    @ViewBuilder private func screen(for feature: MobileFeature) -> some View {
        switch feature {
        case FeatureTransactions.feature:
            TransactionsFlowView(dependencies: dependencies, router: composition.router)
        case FeatureReceiptCapture.feature:
            ReceiptCaptureView()
        default:
            // Unreachable: `RootFeature.renderable` is what the shell filters
            // against, so a feature with no screen is never offered. Drawn as
            // the nothing-available state rather than as an empty view, because
            // a blank screen is the one outcome with no way back.
            unavailableExplanation
        }
    }

    /// What the BFM said is not usable, in its own words rather than one
    /// sentence covering both. "Not answering" and "answered something this
    /// build cannot read" call for different next actions, and the second one
    /// is about the app rather than the server.
    ///
    /// The retry is not decoration. Nothing on this screen makes a request, so
    /// a pillar coming back is not something the app finds out about by
    /// waiting — without a way to ask again, recovering means force-quitting.
    private var unavailableExplanation: some View {
        ErrorStateView(
            message: RootCopy.nothingAvailable(surface.unavailable),
            retryTitle: RootCopy.retry
        ) {
            Task { await shell.reloadBootstrap() }
        }
        .frame(maxHeight: .infinity)
    }

    /// Non-blocking, above the content, and never in the way of it. The app is
    /// usable; this says the picture it is working from is incomplete.
    @ViewBuilder private var degradedBanner: some View {
        if surface.bootstrap.isDegraded {
            PopsCard {
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    Text(RootCopy.degraded)
                        .font(.popsBody)
                        .foregroundStyle(Color.popsMutedForeground)
                    if case .failed = surface.bootstrap {
                        PopsButton(RootCopy.retry) { Task { await shell.reloadBootstrap() } }
                    }
                }
            }
            .padding([.horizontal, .top], PopsSpacing.lg)
        }
    }

    /// Built from the session rather than held, because the client behind it is
    /// per device — see ``AppComposition``.
    private var dependencies: AppDependencies {
        guard case .paired(let device) = shell.session.state else {
            return composition.pairingDependencies
        }
        return composition.dependencies(for: device)
    }
}
