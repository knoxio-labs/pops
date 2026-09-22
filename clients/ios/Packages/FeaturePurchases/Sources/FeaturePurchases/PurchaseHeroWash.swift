import DesignSystem
import SwiftUI

internal struct PurchaseHeroWash: View {
    private let radius: CGFloat = 190

    internal var body: some View {
        RadialGradient(
            colors: [Color.popsPurchases.opacity(0.55), Color.popsPurchases.opacity(0)],
            center: .topTrailing,
            startRadius: PopsSpacing.zero,
            endRadius: radius
        )
        .frame(width: radius, height: radius)
        .accessibilityHidden(true)
    }
}
