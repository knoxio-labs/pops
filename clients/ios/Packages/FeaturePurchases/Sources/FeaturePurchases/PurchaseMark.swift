import AppCore
import DesignSystem
import SwiftUI

internal struct PurchaseMark: View {
    internal let purchase: Purchase
    internal var size: CGFloat = 38

    internal var body: some View {
        Group {
            if PurchasesPresentation.isUnattributed(purchase) {
                Image(systemName: "questionmark")
                    .font(.popsSubheadline.weight(.semibold))
                    .foregroundStyle(Color.popsMutedForeground)
                    .frame(width: size, height: size)
                    .background(Color.popsSurface, in: .rect(cornerRadius: PopsRadius.control))
                    .overlay {
                        RoundedRectangle(cornerRadius: PopsRadius.control)
                            .strokeBorder(
                                Color.popsSeparator,
                                style: StrokeStyle(
                                    lineWidth: PopsBorder.hairline,
                                    dash: [PopsSpacing.xs]))
                    }
            } else {
                Text(initials)
                    .font(.popsSubheadline.weight(.semibold))
                    .foregroundStyle(Color.popsBackground)
                    .frame(width: size, height: size)
                    .background(
                        Self.tint(for: PurchasesPresentation.merchant(purchase)),
                        in: .rect(cornerRadius: PopsRadius.control))
            }
        }
        .accessibilityHidden(true)
    }

    private var initials: String {
        PurchasesPresentation.merchant(purchase)
            .split(separator: " ")
            .filter { $0.first?.isLetter == true }
            .prefix(2)
            .compactMap { $0.first.map(String.init) }
            .joined()
            .uppercased()
    }

    private static func tint(for name: String) -> Color {
        let palette: [Color] = [.popsAccent, .popsWarning, .popsSuccess, .popsDestructive]
        let seed = name.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) % 100_003 }
        return palette[seed % palette.count]
    }
}
