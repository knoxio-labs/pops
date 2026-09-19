import DesignSystem
import SwiftUI

/// The same glass icon face every verb on the page wears.
internal struct InventoryLocationActionFace: View {
    internal let symbol: InventorySymbol

    internal var body: some View {
        symbol.image
            .font(.popsSubheadline.weight(.semibold))
            .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
    }
}

/// The name, the path to it with every step tappable, and the counts.
///
/// The path is one wrapping line of links rather than a row of chips, so a
/// long place name breaks inside itself instead of pushing past the edge.
internal struct InventoryLocationHeader: View {
    internal let tree: InventoryLocationTree
    internal let place: InventoryLocationNode

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
                InventorySymbol.location.image
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsInventory)
                    .accessibilityHidden(true)
                Text(place.name)
                    .font(.popsLargeTitle)
                    .foregroundStyle(Color.popsForeground)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
            }
            if !ancestors.isEmpty {
                path
                    .padding(.vertical, PopsSpacing.xs)
            }
            Text(summary)
                .font(.popsCaption)
                .monospacedDigit()
                .foregroundStyle(Color.popsMutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var ancestors: [InventoryLocationNode] {
        Array(tree.breadcrumbs(for: place.id).dropLast())
    }

    private var summary: String {
        let tally = tree.tally(of: place.id)
        return tally.isEmpty ? InventoryLocationRowLabel.emptyDetail : tally.summary
    }

    private var path: some View {
        InventoryPlacementBreadcrumbs(ancestors: ancestors)
    }
}

/// The ancestors above a place, each a link to its own page, wrapping onto
/// as many lines as it needs rather than being cut.
internal struct InventoryPlacementBreadcrumbs: View {
    internal let ancestors: [InventoryLocationNode]

    internal var body: some View {
        InventoryChipFlow(spacing: PopsSpacing.xs) {
            ForEach(Array(ancestors.enumerated()), id: \.element.id) { index, node in
                crumb(node, isFirst: index == 0)
            }
        }
    }

    private func crumb(_ node: InventoryLocationNode, isFirst: Bool) -> some View {
        HStack(spacing: PopsSpacing.xs) {
            if !isFirst {
                Text("\u{203A}")
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            NavigationLink(value: InventoryRoute.place(node.id)) {
                Text(node.name)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsInventory)
            }
            .buttonStyle(.plain)
        }
    }
}
