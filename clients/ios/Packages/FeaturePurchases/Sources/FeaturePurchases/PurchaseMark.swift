import AppCore
import DesignSystem
import SwiftUI

internal struct PurchaseMark: View {
    internal let merchant: MerchantIdentity
    internal var size: CGFloat = 38

    internal init(purchase: Purchase, size: CGFloat = 38) {
        self.merchant = purchase.merchant
        self.size = size
    }

    internal init(merchant: MerchantIdentity, size: CGFloat = 38) {
        self.merchant = merchant
        self.size = size
    }

    internal var body: some View {
        Group {
            if merchant == .unattributed {
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
                        Self.tint(for: displayName),
                        in: .rect(cornerRadius: PopsRadius.control))
            }
        }
        .accessibilityHidden(true)
    }

    private var displayName: String {
        merchant.displayName ?? "Merchant not recognised"
    }

    private var initials: String {
        displayName
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
