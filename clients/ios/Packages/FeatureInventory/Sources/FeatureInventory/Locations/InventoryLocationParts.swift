import DesignSystem
import SwiftUI

/// A small section label over a panel, aligned with the rows inside it.
internal struct InventoryLocationSectionHeader: View {
    internal let title: String
    internal var trailing: String?

    internal var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
            Text(title)
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: PopsSpacing.sm)
            if let trailing {
                Text(trailing)
                    .font(.popsCaption)
                    .monospacedDigit()
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .padding(.horizontal, PopsSpacing.md)
    }
}

/// One muted line where a list would be.
internal struct InventoryLocationEmptyLine: View {
    internal let text: String

    internal var body: some View {
        Text(text)
            .font(.popsBody)
            .foregroundStyle(Color.popsMutedForeground)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, PopsSpacing.md)
            .transition(.opacity)
    }
}

/// Rows before their places arrive.
internal struct InventoryLocationListSkeleton: View {
    internal let rows: Int
    @ScaledMetric(relativeTo: .body) private var rowHeight = PopsSize.touchTarget

    internal var body: some View {
        VStack(spacing: PopsSpacing.sm) {
            ForEach(0..<rows, id: \.self) { _ in
                RoundedRectangle(cornerRadius: PopsRadius.card, style: .continuous)
                    .fill(Color.popsSurface)
                    .frame(height: rowHeight)
            }
        }
        .popsShimmer()
        .accessibilityLabel("Loading")
    }
}

/// A place in the dashboard's row idiom: the place glyph, its name over what
/// it holds, and the items it holds in all.
///
/// A location records no kind (room, shelf, drawer), so every place draws the
/// one place glyph and an empty one reads "Place" where the design named its
/// kind.
internal struct InventoryLocationRowLabel: View {
    internal let place: InventoryLocationNode
    internal let tree: InventoryLocationTree
    internal var showsPath = false

    internal static let emptyDetail = "Place"

    internal var body: some View {
        let tally = tree.tally(of: place.id)
        InventoryGroundedRowLabel(
            title: place.name,
            detail: detail(tally),
            symbol: InventorySymbol.location.system,
            value: tally.items == 0 ? nil : "\(tally.items)")
    }

    private func detail(_ tally: InventoryPlaceTally) -> String {
        let path = tree.parentPath(of: place.id)
        if showsPath, !path.isEmpty { return path }
        var counts = tally
        counts.items = 0
        return counts.isEmpty ? Self.emptyDetail : counts.summary
    }
}

/// Rows separated the way the dashboard separates them, in its panel.
internal struct InventoryLocationPanel<Row: Identifiable, Content: View>: View {
    internal let rows: [Row]
    @ViewBuilder internal let content: (Row) -> Content

    internal var body: some View {
        InventoryGroundedListPanel {
            VStack(alignment: .leading, spacing: PopsSpacing.zero) {
                ForEach(rows) { row in
                    content(row)
                        .transition(InventoryMotion.row)
                    if row.id != rows.last?.id {
                        PopsDivider()
                            .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                    }
                }
            }
        }
    }
}

/// One line with its glyph, wrapping rather than cut when it runs long.
internal struct InventoryLocationNoticeLine: View {
    internal let symbol: String
    internal let tint: Color
    internal let text: String

    internal var body: some View {
        Label {
            Text(text)
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsForeground)
                .fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: symbol)
                .font(.popsSubheadline)
                .foregroundStyle(tint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, PopsSpacing.md)
        .inventoryFadeIn()
    }
}
