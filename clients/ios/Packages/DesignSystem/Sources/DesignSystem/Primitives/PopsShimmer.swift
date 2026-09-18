import SwiftUI

/// A highlight sweeping across placeholder shapes: the sign that a skeleton is
/// waiting for something rather than showing an empty screen.
///
/// Apply it to the stack of placeholder blocks, not to the screen around them.
/// The sweep is masked by the view it modifies, so a background under that
/// view would shimmer with the blocks. Under Reduce Motion the placeholders
/// stay still and nothing is drawn over them.
public struct PopsShimmer: ViewModifier {
    static let period: TimeInterval = 1.4
    static let bandFraction: CGFloat = 0.4
    static let highlight = Color.popsForeground.opacity(0.1)

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init() {}

    public func body(content: Content) -> some View {
        content.overlay {
            if !reduceMotion {
                TimelineView(.animation) { timeline in
                    GeometryReader { proxy in
                        band(width: proxy.size.width, phase: Self.phase(at: timeline.date))
                    }
                }
                .mask { content }
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            }
        }
    }

    private func band(width: CGFloat, phase: CGFloat) -> some View {
        LinearGradient(
            colors: [Self.highlight.opacity(0), Self.highlight, Self.highlight.opacity(0)],
            startPoint: .leading,
            endPoint: .trailing
        )
        .frame(width: width * Self.bandFraction)
        .offset(x: Self.offset(phase: phase, width: width))
    }

    /// How far through one sweep the highlight is at `date`, in `0..<1`.
    static func phase(at date: Date) -> CGFloat {
        let elapsed = date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: period)
        let positive = elapsed < 0 ? elapsed + period : elapsed
        return CGFloat(positive / period)
    }

    /// The band's leading edge for a phase: wholly before the leading edge at
    /// zero, wholly past the trailing edge at one.
    static func offset(phase: CGFloat, width: CGFloat) -> CGFloat {
        let band = width * bandFraction
        return -band + phase * (width + band)
    }
}

extension View {
    /// Sweeps a highlight across this view's shapes while it stands in for
    /// content that has not arrived. See ``PopsShimmer``.
    public func popsShimmer() -> some View {
        modifier(PopsShimmer())
    }
}

#Preview("Shimmer") {
    ColorSchemePreview {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            ForEach(0..<4, id: \.self) { _ in
                RoundedRectangle(cornerRadius: PopsRadius.control)
                    .fill(Color.popsSurface)
                    .frame(height: PopsSize.touchTarget)
            }
        }
        .popsShimmer()
        .padding(PopsSpacing.lg)
    }
}
