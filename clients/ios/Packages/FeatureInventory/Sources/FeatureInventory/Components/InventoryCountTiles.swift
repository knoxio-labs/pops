import DesignSystem
import SwiftUI

/// One count in a strip of tiles: its glyph, its number and what it counts.
internal struct InventoryCountTile: Identifiable, Equatable {
    internal let title: String
    internal let count: Int
    internal let symbol: String
    internal var tone: Color = .popsAccent

    internal var id: String { title }
}

/// Counts as small glass tiles side by side, the dashboard's browse tiles at
/// their most compact, stacked once the text is an accessibility size.
internal struct InventoryCountTiles: View {
    internal let tiles: [InventoryCountTile]
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @ScaledMetric(relativeTo: .subheadline) private var glyphHeight = PopsSpacing.xl

    internal var body: some View {
        let layout =
            dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: PopsSpacing.sm))
            : AnyLayout(HStackLayout(spacing: PopsSpacing.sm))
        layout {
            ForEach(tiles) { tile($0) }
        }
        .fixedSize(horizontal: false, vertical: true)
        .popsMotion(value: tiles)
    }

    private func tile(_ tile: InventoryCountTile) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Image(systemName: tile.symbol)
                .font(.popsSubheadline)
                .foregroundStyle(tile.tone)
                .frame(height: glyphHeight, alignment: .bottomLeading)
            Text("\(tile.count)")
                .font(.popsHeadline)
                .monospacedDigit()
                .contentTransition(.numericText(value: Double(tile.count)))
                .foregroundStyle(Color.popsForeground)
            Text(tile.title)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(PopsSpacing.sm)
        .popsGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
        .accessibilityElement(children: .combine)
    }
}

/// The browser before its counts arrive: blank tiles of the same size.
internal struct InventoryCountTilesSkeleton: View {
    internal let count: Int
    @ScaledMetric(relativeTo: .body) private var tileHeight = PopsSize.touchTarget * 1.6

    internal var body: some View {
        HStack(spacing: PopsSpacing.sm) {
            ForEach(0..<count, id: \.self) { _ in
                RoundedRectangle(cornerRadius: PopsRadius.card, style: .continuous)
                    .fill(Color.popsSurface)
                    .frame(height: tileHeight)
            }
        }
    }
}
