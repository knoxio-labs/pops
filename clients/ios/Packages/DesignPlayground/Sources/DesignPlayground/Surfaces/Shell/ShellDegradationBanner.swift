import DesignSystem
import SwiftUI

/// The notice `ContentView` draws above the features while the shell's
/// bootstrap answer is stale or failed, with Try again only when it failed.
///
/// One view for both places the playground shows it: the shell's own surface,
/// and Inventory's offline stage, which draws the app's banner rather than a
/// sync status of its own.
internal struct ShellDegradationBanner: View {
    internal var showsRetry = false

    internal var body: some View {
        PopsCard {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                Text(ShellCopy.degraded)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsMutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
                if showsRetry {
                    PopsButton(ShellCopy.retry) {}
                }
            }
        }
        .padding([.horizontal, .top], PopsSpacing.lg)
    }
}
