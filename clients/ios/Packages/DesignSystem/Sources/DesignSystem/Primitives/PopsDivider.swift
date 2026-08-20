import SwiftUI

/// A hairline rule between two groups of content.
///
/// SwiftUI's own `Divider` is the obvious alternative and is the wrong one
/// here: it draws in the system separator colour, which is the one colour on
/// screen that would not follow `Resources/Colors.xcassets`. This is the same
/// line in `popsSeparator`.
public struct PopsDivider: View {
    public init() {}

    public var body: some View {
        Rectangle()
            .fill(Color.popsSeparator)
            .frame(height: PopsBorder.hairline)
            .frame(maxWidth: .infinity)
            // A rule is not a thing to stop on. Without this VoiceOver
            // announces an empty element between every pair of groups.
            .accessibilityHidden(true)
    }
}

#Preview("Divider") {
    ColorSchemePreview {
        VStack(spacing: PopsSpacing.md) {
            Text("Above")
                .font(.popsBody)
                .foregroundStyle(Color.popsForeground)
            PopsDivider()
            Text("Below")
                .font(.popsBody)
                .foregroundStyle(Color.popsForeground)
        }
        .padding(PopsSpacing.lg)
    }
}
