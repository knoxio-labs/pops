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
/// It draws no navigation chrome of its own. A feature that has more than one
/// screen brings its own `NavigationStack` — `TransactionsFlowView` is the
/// first — because the routes between those screens belong to that feature and
/// resolving them here would mean this file naming every screen in the app. A
/// stack around a stack is also simply broken: the inner one wins and the outer
/// one silently does nothing.
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

    /// One screen per available feature, in the BFM's order. Today that is one
    /// feature and a `ForEach` over it would be a tab bar with a single tab, so
    /// the first one is shown outright — and a second feature arriving is the
    /// moment to decide what navigation between them looks like, rather than
    /// now, with nothing to look at.
    @ViewBuilder private var features: some View {
        if let feature = surface.available.first {
            screen(for: feature)
        } else {
            unavailableExplanation
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
