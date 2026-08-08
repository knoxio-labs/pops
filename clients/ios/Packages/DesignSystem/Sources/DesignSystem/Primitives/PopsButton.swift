import SwiftUI

/// The app's action control.
///
/// Outlined rather than filled, and that is not an aesthetic preference: a
/// filled control needs a foreground colour guaranteed to read on
/// `popsAccent`, which is a token the palette does not have and a contrast pair
/// `ContrastTests` does not cover. An outline needs neither — accent on a
/// surface is already asserted readable in both schemes.
///
/// Disabled is a state it draws rather than one each caller invents: SwiftUI's
/// default dimming applies to the whole subtree, so a hand-rolled button ends
/// up with a faded border and full-strength text unless someone notices.
public struct PopsButton: View {
    @Environment(\.isEnabled) private var isEnabled

    private let title: String
    /// Exposed so a test can call it without a rendered hierarchy — the same
    /// affordance `ErrorStateView` already relies on.
    internal let action: () -> Void

    public init(_ title: String, action: @escaping () -> Void) {
        self.title = title
        self.action = action
    }

    private var foreground: Color { isEnabled ? .popsAccent : .popsMutedForeground }

    public var body: some View {
        Button(title, action: action)
            .font(.popsHeadline)
            .foregroundStyle(foreground)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.vertical, PopsSpacing.sm)
            .overlay(
                RoundedRectangle(cornerRadius: PopsRadius.control)
                    .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
            )
            // Without this the tappable area is the glyphs, which at the small
            // Dynamic Type sizes is a target smaller than a fingertip.
            .contentShape(RoundedRectangle(cornerRadius: PopsRadius.control))
    }
}

#Preview("Button") {
    ColorSchemePreview {
        VStack(spacing: PopsSpacing.md) {
            PopsButton("Pair") {}
            PopsButton("Pair") {}
                .disabled(true)
        }
    }
}
