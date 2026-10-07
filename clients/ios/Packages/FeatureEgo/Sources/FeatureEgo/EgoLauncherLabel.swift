import DesignSystem
import SwiftUI

/// The compact Ego control shown beside the shell's other navigation tabs.
public struct EgoLauncherIcon: View {
    @ScaledMetric(relativeTo: .body) private var diameter = PopsSize.touchTarget

    /// Creates the icon used by Ego's global launcher.
    public init() {}

    public var body: some View {
        Image(systemName: FeatureEgo.symbolName)
            .font(.popsSubheadline.weight(.semibold))
            .foregroundStyle(Color.popsAccent)
            .frame(width: diameter, height: diameter)
            .popsGlass(in: Circle())
            .overlay {
                Circle().stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
            }
            .contentShape(Circle())
    }
}

/// A tab label that gives Ego the same compact, circular launcher treatment
/// in the native shell and the design playground.
public struct EgoLauncherTabLabel: View {
    public init() {}

    public var body: some View {
        VStack(spacing: PopsSpacing.xs) {
            Image(systemName: "bubble.left.circle")
                .font(.popsSubheadline.weight(.semibold))
                .foregroundStyle(Color.popsAccent)
            Text(FeatureEgo.displayName)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(FeatureEgo.displayName)
    }
}
