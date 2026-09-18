import DesignSystem
import SwiftUI

/// One number the Sync page counts: how many, and the row it heads.
internal struct InventorySyncCount: Identifiable {
    internal let id = UUID()
    internal let title: String
    internal let count: Int
    internal let symbol: String
}

/// The Sync page's own count row: Waiting, Needs attention, Resolved today.
/// Unlike the dashboard's Browse tiles these open nothing — the sections
/// below are already this same page — so this is a plain stat, not a
/// `NavigationLink`.
internal struct InventorySyncCountTiles: View {
    internal let tiles: [InventorySyncCount]

    internal var body: some View {
        HStack(spacing: PopsSpacing.sm) {
            ForEach(tiles) { tile in
                VStack(spacing: PopsSpacing.xs) {
                    Image(systemName: tile.symbol)
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsAccent)
                    Text("\(tile.count)")
                        .font(.popsTitle.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(Color.popsForeground)
                        .contentTransition(.numericText(value: Double(tile.count)))
                    Text(tile.title)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, PopsSpacing.sm)
                .accessibilityElement(children: .combine)
            }
        }
        .padding(.horizontal, PopsSpacing.xs)
        .inventoryGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
    }
}
