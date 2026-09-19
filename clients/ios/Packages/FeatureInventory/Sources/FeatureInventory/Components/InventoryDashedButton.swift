import DesignSystem
import SwiftUI

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
