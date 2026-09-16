import DesignSystem
import SwiftUI

/// Something for the glass to bend.
///
/// Glass with nothing behind it is an expensive way to draw grey, so every
/// purchases hero carries a wash of the accent tint for it to refract. One
/// view rather than a copy per screen: the digest and the detail are meant to
/// look like one place, and two independently-tuned gradients is how they stop.
///
/// Anchored to the corner rather than centred so the refraction falls across
/// the panel instead of sitting symmetrically behind the figure, which reads as
/// a gradient rather than as depth.
internal struct PurchaseHeroWash: View {
    private let radius: CGFloat = 190

    internal var body: some View {
        RadialGradient(
            colors: [Color.popsAccent.opacity(0.55), Color.popsAccent.opacity(0)],
            center: .topTrailing,
            startRadius: PopsSpacing.zero,
            endRadius: radius
        )
        .frame(width: radius, height: radius)
        .accessibilityHidden(true)
    }
}
