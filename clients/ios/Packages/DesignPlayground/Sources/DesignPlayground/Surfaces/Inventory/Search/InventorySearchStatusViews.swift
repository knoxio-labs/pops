import DesignSystem
import SwiftUI

/// The one line every empty or filtered-out list shows, centred at the same
/// height under the search bar wherever it appears.
internal struct InventoryCentredLine: View {
    internal let text: String

    internal var body: some View {
        Text(text)
            .font(.popsBody)
            .foregroundStyle(Color.popsMutedForeground)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.top, PopsSpacing.xl)
            .transition(.opacity)
    }
}

/// A tall dashed outline in Inventory's colour: the one control on a screen
/// with nothing in it yet.
internal struct InventoryDashedActionButton: View {
    internal let title: String
    internal let symbol: String
    internal let action: () -> Void
    @ScaledMetric(relativeTo: .body) private var height = PopsSize.touchTarget * 3

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: PopsRadius.card, style: .continuous)
    }

    internal var body: some View {
        Button(action: action) {
            VStack(spacing: PopsSpacing.sm) {
                Image(systemName: symbol)
                    .font(.popsTitle)
                Text(title)
                    .font(.popsHeadline)
            }
            .foregroundStyle(Color.popsInventory)
            .frame(maxWidth: .infinity, minHeight: height)
            .background(Color.popsInventory.opacity(0.08), in: shape)
            .overlay {
                shape.strokeBorder(
                    Color.popsInventory,
                    style: StrokeStyle(
                        lineWidth: PopsBorder.emphasis, dash: [PopsSpacing.sm, PopsSpacing.xs]))
            }
            .contentShape(shape)
        }
        .buttonStyle(.plain)
    }
}

/// First launch, before anything has been downloaded: one neutral line and
/// the download.
internal struct InventoryFirstLaunchPrompt: View {
    internal var body: some View {
        VStack(spacing: PopsSpacing.lg) {
            InventoryCentredLine(text: "Nothing on this phone yet")
            InventoryDashedActionButton(
                title: "Download", symbol: InventorySymbol.update.system, action: {})
        }
        .inventoryFadeIn()
    }
}
