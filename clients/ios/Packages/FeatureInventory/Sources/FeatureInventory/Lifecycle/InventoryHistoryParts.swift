import DesignSystem
import SwiftUI

/// A browser's large title drawn in its scroll view, with room for a control
/// beside it.
///
/// The bar's large-title slot clips anything taller than the title's text, so
/// a page that wants a control on the title's row draws the row itself and
/// pairs it with `inventoryCollapsingTitle(_:)`.
internal struct InventoryPageTitle<Trailing: View>: View {
    internal let title: String
    @ViewBuilder internal let trailing: () -> Trailing

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            Text(title)
                .font(.popsLargeTitle)
                .foregroundStyle(Color.popsForeground)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: PopsSpacing.sm)
            trailing()
        }
    }
}

extension View {
    /// The inline title for a page that draws its own large one: hidden until
    /// the drawn title has scrolled under the bar, as a large title collapses.
    internal func inventoryCollapsingTitle(_ title: String) -> some View {
        modifier(InventoryCollapsingTitle(title: title))
    }
}

private struct InventoryCollapsingTitle: ViewModifier {
    let title: String
    @State private var scrolledAway = false

    func body(content: Content) -> some View {
        content
            .onScrollGeometryChange(for: Bool.self) { geometry in
                geometry.contentOffset.y + geometry.contentInsets.top > PopsSpacing.xxl
            } action: { _, isAway in
                scrolledAway = isAway
            }
            .navigationTitle(title)
            .inventoryTitleDisplay(large: false)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text(title)
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsForeground)
                        .opacity(scrolledAway ? 1 : 0)
                        .inventoryMotion(value: scrolledAway)
                        .accessibilityHidden(!scrolledAway)
                }
            }
    }
}

/// One muted line, centred, where a list would be.
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

/// The trailing chevron on a row that opens something.
internal struct InventoryRowChevron: View {
    internal var body: some View {
        Image(systemName: "chevron.forward")
            .font(.popsCaption.weight(.semibold))
            .foregroundStyle(Color.popsMutedForeground)
            .padding(.trailing, PopsSpacing.sm)
            .accessibilityHidden(true)
    }
}

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
