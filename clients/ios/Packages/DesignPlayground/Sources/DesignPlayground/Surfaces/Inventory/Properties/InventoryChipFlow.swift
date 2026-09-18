import DesignSystem
import SwiftUI

/// Chips that wrap onto as many lines as they need.
///
/// `ChipStrip` is the inspector's switcher and scrolls horizontally, which is
/// right for a fixed set of states and wrong for tags: a tag pushed off the
/// end of a scrolling row is a capability the reader does not know the object
/// has. This wraps instead, so the whole set is always on screen, and grows
/// taller rather than clipping when Dynamic Type makes each chip wider.
internal struct InventoryChipFlow: Layout {
    internal let spacing: CGFloat

    internal init(spacing: CGFloat = PopsSpacing.sm) {
        self.spacing = spacing
    }

    internal func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) -> CGSize {
        let width = proposal.replacingUnspecifiedDimensions().width
        let rows = rows(of: subviews, within: width)
        let height = rows.reduce(CGFloat.zero) { $0 + $1.height + spacing }
        return CGSize(width: width, height: max(height - spacing, 0))
    }

    internal func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) {
        var originY = bounds.minY
        for row in rows(of: subviews, within: bounds.width) {
            var originX = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(
                    at: CGPoint(x: originX, y: originY),
                    anchor: .topLeading,
                    proposal: ProposedViewSize(size)
                )
                originX += size.width + spacing
            }
            originY += row.height + spacing
        }
    }

    private func rows(of subviews: Subviews, within width: CGFloat) -> [InventoryChipRow] {
        var rows: [InventoryChipRow] = []
        var current = InventoryChipRow()
        var cursor = CGFloat.zero

        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let needed = current.indices.isEmpty ? size.width : cursor + spacing + size.width
            if needed > width, !current.indices.isEmpty {
                rows.append(current)
                current = InventoryChipRow()
                cursor = 0
            }
            cursor = current.indices.isEmpty ? size.width : cursor + spacing + size.width
            current.indices.append(index)
            current.height = max(current.height, size.height)
        }
        if !current.indices.isEmpty { rows.append(current) }
        return rows
    }
}

/// One line of wrapped chips: which subviews are on it, and how tall it is.
internal struct InventoryChipRow {
    internal var indices: [Int] = []
    internal var height: CGFloat = 0
}
