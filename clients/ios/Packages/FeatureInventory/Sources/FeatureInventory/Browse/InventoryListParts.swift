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

/// Rows before they arrive.
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
