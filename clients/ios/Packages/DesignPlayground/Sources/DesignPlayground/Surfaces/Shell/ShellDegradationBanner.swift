import DesignSystem
import SwiftUI

/// The notice `ContentView` draws above the features while the shell's
/// bootstrap answer is stale or failed, with Try again only when it failed.
///
/// One view for both places the playground shows it: the shell's own surface,
/// and Inventory's offline stage, which draws the app's banner rather than a
/// sync status of its own.
///
/// Carries a dismiss control (POPS-3580 rehearsal fix): the banner used to be
/// purely derived from bootstrap state, with no way to hide it, so a
/// Watchtower blip that healed itself in a few seconds (POPS-3731) sat there
/// for the rest of a foregrounded session. This is a new pattern, not a
/// pre-existing approved one — there was no dismissable shell notice to
/// match, so this mirrors exactly what `ContentView.degradedBanner` now
/// draws, for review here before it is taken as the approved shape.
internal struct ShellDegradationBanner: View {
    internal var showsRetry = false

    internal var body: some View {
        PopsCard {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                HStack(alignment: .top, spacing: PopsSpacing.md) {
                    Text(ShellCopy.degraded)
                        .font(.popsBody)
                        .foregroundStyle(Color.popsMutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: PopsSpacing.sm)
                    Button {
                    } label: {
                        Image(systemName: "xmark")
                            .font(.popsBody)
                            .foregroundStyle(Color.popsMutedForeground)
                    }
                    .accessibilityLabel(ShellCopy.dismissDegraded)
                }
                if showsRetry {
                    PopsButton(ShellCopy.retry) {}
                }
            }
        }
        .padding([.horizontal, .top], PopsSpacing.lg)
    }
}
