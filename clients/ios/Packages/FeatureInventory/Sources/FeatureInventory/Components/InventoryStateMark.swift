import AppCore
import DesignSystem
import SwiftUI

/// A state worth telling the reader about, and how it is told.
///
/// Lifecycle shows only when it is not active; access shows on every
/// container, because open or closed is a container's primary fact. The two
/// are separate marks by design: one badge for both would read as one state.
internal struct InventoryStateMark: Identifiable, Equatable {
    internal let id: String
    internal let label: String
    internal let symbol: String
    /// Drawn in Inventory's colour at full strength. Only an open container is,
    /// because it is the one state that is work still in progress.
    internal let isHighlighted: Bool

    internal static let full = InventoryStateMark(
        id: "full", label: "Full", symbol: "square.fill", isHighlighted: false)

    internal static func marks(for item: InventoryItem) -> [InventoryStateMark] {
        var marks: [InventoryStateMark] = []
        if let access = item.containment?.access {
            marks.append(
                InventoryStateMark(
                    id: "access", label: access == .open ? "Open" : "Closed",
                    symbol: InventorySymbol.record(access: access).system,
                    isHighlighted: access == .open))
        }
        if item.lifecycle != .active {
            marks.append(
                InventoryStateMark(
                    id: "lifecycle", label: lifecycleLabel(item.lifecycle),
                    symbol: InventorySymbol.retired.system, isHighlighted: false))
        }
        return marks
    }

    private static func lifecycleLabel(_ lifecycle: InventoryLifecycle) -> String {
        switch lifecycle {
        case .active: "Active"
        case .retired: "Retired"
        case .discarded: "Discarded"
        case .lost: "Lost"
        case .destroyed: "Destroyed"
        case .unrecognised(let wire): wire.capitalized
        }
    }
}

/// One state mark drawn as a chip. An open container's is in Inventory's
/// colour at full strength; everything else is quiet.
internal struct InventoryStateBadge: View {
    internal let mark: InventoryStateMark

    internal var body: some View {
        Text(mark.label)
            .font(.popsCaption.weight(.semibold))
            .foregroundStyle(tone)
            .padding(.horizontal, PopsSpacing.sm)
            .padding(.vertical, PopsSpacing.xs)
            .background(tone.opacity(0.14), in: .capsule)
    }

    private var tone: Color { mark.isHighlighted ? .popsInventory : .popsMutedForeground }
}
