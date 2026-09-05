import DesignSystem
import FeaturePurchases
import SwiftUI

/// Whether the paired shell is showing a stale bootstrap answer, a failed
/// one, or neither. Named rather than reused from `BootstrapPhase` because
/// the banner only cares about this distinction — not which `RegistrySource`
/// made an answer stale, which `BootstrapPhase.isDegraded` also folds in.
internal enum ShellDegradation: Hashable, Sendable {
    case none
    case stale
    case failed
}

/// The paired shell's own content: the degraded banner `ContentView` draws
/// above whatever features are showing, over the real ``PurchasesListView`` —
/// not a placeholder. The question a banner state exists to answer is
/// whether it reads as a notice over usable content or as a wall in front of
/// it, and a placeholder cannot be asked that.
///
/// Attached with `.safeAreaInset(edge: .top)` rather than stacked above the
/// content, mirroring `ContentView`'s own shape (POPS-2894), so that what is
/// reviewed here is the construction the app actually ships. The reason
/// `ContentView` needs the inset — a stack takes the banner's height off the
/// top of its `TabView`, carrying the tab bar up with it — is not visible in
/// this surface, which renders no tab bar; `ContentViewTabSwitcherTests`
/// covers that.
internal struct ShellContentView: View {
    let degradation: ShellDegradation

    var body: some View {
        PurchasesListView(
            dependencies: playgroundPurchasesDependencies(rows: PurchasesFixtures.all)
        )
        .safeAreaInset(edge: .top) { banner }
    }

    @ViewBuilder private var banner: some View {
        if degradation != .none {
            PopsCard {
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    Text(ShellCopy.degraded)
                        .font(.popsBody)
                        .foregroundStyle(Color.popsMutedForeground)
                    if degradation == .failed {
                        PopsButton(ShellCopy.retry) {}
                    }
                }
            }
            .padding([.horizontal, .top], PopsSpacing.lg)
        }
    }
}
