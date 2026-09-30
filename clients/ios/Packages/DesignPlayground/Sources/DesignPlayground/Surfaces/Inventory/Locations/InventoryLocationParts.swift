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
    @ScaledMetric(relativeTo: .body) private var markSize = PopsSize.touchTarget
    @ScaledMetric(relativeTo: .caption) private var lineHeight = PopsSpacing.sm

    internal var body: some View {
        LazyVStack(spacing: PopsSpacing.zero) {
            ForEach(0..<max(rows, 0), id: \.self) { index in
                let primaryWidth: CGFloat = index.isMultiple(of: 2) ? 0.72 : 0.56
                HStack(spacing: PopsSpacing.md) {
                    RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
                        .fill(Color.popsSeparator)
                        .frame(width: markSize, height: markSize)
                    GeometryReader { geometry in
                        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                            Capsule()
                                .fill(Color.popsSeparator)
                                .frame(
                                    width: geometry.size.width * primaryWidth, height: lineHeight)
                            Capsule()
                                .fill(Color.popsSeparator)
                                .frame(width: geometry.size.width * 0.38, height: lineHeight)
                        }
                        .frame(maxHeight: .infinity, alignment: .center)
                    }
                    .frame(maxWidth: .infinity)
                    Capsule()
                        .fill(Color.popsSeparator)
                        .frame(width: markSize * 0.55, height: lineHeight)
                }
                .frame(minHeight: markSize)
                .padding(.vertical, PopsSpacing.xs)
                if index < rows - 1 {
                    PopsDivider()
                        .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                }
            }
        }
        .popsShimmer()
        .accessibilityLabel("Loading")
    }
}

/// A place in the dashboard's row idiom: its kind's glyph, its name over what
/// it holds, and the items it holds in all.
internal struct InventoryLocationRowLabel: View {
    internal let place: InventoryLocationNode
    internal let tree: InventoryLocationTree
    internal var showsPath = false

    internal var body: some View {
        let tally = tree.tally(of: place.id)
        InventoryGroundedRowLabel(
            title: place.name,
            detail: detail(tally),
            symbol: place.kind.symbol,
            value: tally.items == 0 ? nil : "\(tally.items)")
    }

    private func detail(_ tally: InventoryPlaceTally) -> String {
        let path = tree.parentPath(of: place.id)
        if showsPath, !path.isEmpty { return path }
        var counts = tally
        counts.items = 0
        return counts.isEmpty ? place.kind.title : counts.summary
    }
}

/// Rows separated the way the dashboard separates them, in its panel.
internal struct InventoryLocationPanel<Row: Identifiable, Content: View>: View {
    internal let rows: [Row]
    internal let onReachEnd: (() -> Void)?
    @ViewBuilder internal let content: (Row) -> Content

    internal init(
        rows: [Row], onReachEnd: (() -> Void)? = nil,
        @ViewBuilder content: @escaping (Row) -> Content
    ) {
        self.rows = rows
        self.onReachEnd = onReachEnd
        self.content = content
    }

    internal var body: some View {
        InventoryGroundedListPanel {
            LazyVStack(alignment: .leading, spacing: PopsSpacing.zero) {
                ForEach(rows) { row in
                    content(row)
                        .transition(InventoryMotion.row)
                        .onAppear {
                            if row.id == rows.last?.id { onReachEnd?() }
                        }
                    if row.id != rows.last?.id {
                        PopsDivider()
                            .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                    }
                }
            }
            .inventoryMotion(value: rows.map(\.id))
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
