import DesignSystem
import SwiftUI

extension InventoryPlacement {
    /// The one line a row shows about where something is.
    ///
    /// Innermost first, because the container you would open is the useful
    /// half; the room follows for orientation. An item inside a container that
    /// is itself being carried says so rather than inventing a room.
    internal func summary(inHandTerm: String) -> String {
        switch self {
        case .direct(let location):
            return location
        case .contained(let location, let containers):
            let place = location ?? "being carried"
            guard let inner = containers.last else { return place }
            return "In \(inner) · \(place)"
        case .inHand(let previous):
            guard let previous else { return inHandTerm }
            return "\(inHandTerm) · was in \(previous)"
        }
    }

    /// The crumbs to draw when there is not room for all of them: the room,
    /// then the container the item is actually in, with the elision marked.
    /// Nothing to collapse at two crumbs or fewer.
    internal var collapsedCrumbs: [String] {
        let full = crumbs
        guard full.count > 2, let first = full.first, let last = full.last else { return full }
        return [first, "…", last]
    }
}

/// The path from a room to the thing holding an item.
///
/// Collapses to room … container when the full path will not fit, rather than
/// truncating mid-word, the two ends are the ones a reader needs, and the
/// middle is one tap away on the detail screen.
internal struct InventoryPlacementPath: View {
    internal let placement: InventoryPlacement
    @Environment(\.inventoryStyle) private var style

    internal var body: some View {
        if placement.isInHand {
            Label(style.inHandTerm.rawValue, systemImage: InventorySymbol.inHand.system)
                .font(.popsCaption.weight(.semibold))
                .foregroundStyle(Color.popsInventory)
        } else if placement.crumbs.isEmpty {
            Text("Location unknown")
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        } else {
            ViewThatFits(in: .horizontal) {
                trail(placement.crumbs)
                trail(placement.collapsedCrumbs)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(placement.crumbs.joined(separator: ", then "))
        }
    }

    private func trail(_ crumbs: [String]) -> some View {
        HStack(spacing: PopsSpacing.xs) {
            ForEach(Array(crumbs.enumerated()), id: \.offset) { index, crumb in
                if index > 0 {
                    Image(systemName: "chevron.forward")
                        .font(.popsCaption.weight(.semibold))
                        .foregroundStyle(Color.popsMutedForeground)
                }
                Text(crumb)
                    .font(.popsCaption)
                    .foregroundStyle(
                        index == crumbs.count - 1 ? Color.popsForeground : Color.popsMutedForeground
                    )
                    .lineLimit(1)
                    .fixedSize()
            }
        }
    }
}
