import DesignSystem
import SwiftUI

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
