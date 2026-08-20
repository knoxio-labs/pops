import SwiftUI

/// The app's action control, in two weights.
///
/// ``PopsButtonProminence/standard`` is outlined, and that is not an aesthetic
/// preference: it is the weight a screen can carry several of without any of
/// them claiming to be the one to press.
///
/// ``PopsButtonProminence/prominent`` is filled, for the one action a screen
/// exists to offer. It draws its label in `popsBackground` on `popsAccent` —
/// the pair `ContrastTests.filledAccentIsReadable` measures, and the reason
/// this variant can exist at all. Without a foreground guaranteed to read on
/// the accent there is no honest filled control, which is why this package had
/// only the outline for as long as it did.
///
/// Disabled is a state it draws rather than one each caller invents: SwiftUI's
/// default dimming applies to the whole subtree, so a hand-rolled button ends
/// up with a faded border and full-strength text unless someone notices.
public struct PopsButton: View {
    @Environment(\.isEnabled) private var isEnabled

    /// The base touch target, scaled with the text so the control keeps its
    /// proportions rather than becoming a thin strip around large type.
    @ScaledMetric(relativeTo: .body) private var minimumHeight = PopsSize.touchTarget

    private let title: String
    private let prominence: PopsButtonProminence
    /// Exposed so a test can call it without a rendered hierarchy — the same
    /// affordance `ErrorStateView` already relies on.
    internal let action: () -> Void

    public init(
        _ title: String,
        prominence: PopsButtonProminence = .standard,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.prominence = prominence
        self.action = action
    }

    /// A disabled prominent button drops to the outline's colours rather than
    /// staying filled in a dimmed accent: a filled control that cannot be
    /// pressed still looks like the thing to press.
    private var foreground: Color {
        guard isEnabled else { return .popsMutedForeground }
        return prominence == .prominent ? .popsBackground : .popsAccent
    }

    /// Only the prominent variant fills. The outline deliberately draws no
    /// surface of its own so it composes onto a card and onto the background
    /// alike — a fill here would make it invisible on whichever of the two it
    /// did not match.
    private var prominentFill: Color { isEnabled ? .popsAccent : .popsSurface }

    public var body: some View {
        Button(title, action: action)
            .font(.popsHeadline)
            .foregroundStyle(foreground)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.vertical, PopsSpacing.sm)
            .frame(maxWidth: prominence == .prominent ? .infinity : nil)
            .frame(minHeight: minimumHeight)
            .background {
                if prominence == .prominent {
                    RoundedRectangle(cornerRadius: PopsRadius.control)
                        .fill(prominentFill)
                }
            }
            .overlay(
                RoundedRectangle(cornerRadius: PopsRadius.control)
                    .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
            )
            // Without this the tappable area is the glyphs, which at the small
            // Dynamic Type sizes is a target smaller than a fingertip.
            .contentShape(RoundedRectangle(cornerRadius: PopsRadius.control))
    }
}

/// How much of a screen's attention a button is asking for.
public enum PopsButtonProminence: Hashable, Sendable {
    /// One of several things that can be done here.
    case standard
    /// The thing this screen is for. At most one per screen — a second
    /// prominent button is two screens' worth of primary action on one.
    case prominent
}

#Preview("Button") {
    ColorSchemePreview {
        VStack(spacing: PopsSpacing.md) {
            PopsButton("Photograph a receipt", prominence: .prominent) {}
            PopsButton("Photograph a receipt", prominence: .prominent) {}
                .disabled(true)
            PopsButton("Pair") {}
            PopsButton("Pair") {}
                .disabled(true)
        }
        .padding(PopsSpacing.lg)
    }
}
