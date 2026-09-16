import DesignSystem
import SwiftUI

/// Whether an inactive item turns up in an ordinary search, as the chip row
/// above the results and the empty state below them when the answer is "no,
/// not unless you ask".
internal enum InventoryLifecycleScope: String, CaseIterable, Hashable, Identifiable {
    case active = "Active"
    case all = "All"
    case inactiveOnly = "Inactive"

    internal var id: String { rawValue }
}

/// The chip row a catalogue search shows above its results.
///
/// Under `hiddenByDefault` this is load-bearing: it is the only way to see an
/// inactive item at all. Under the other two treatments it is a convenience,
/// because the results already show them.
internal struct InventoryLifecycleScopeChips: View {
    @Binding internal var scope: InventoryLifecycleScope

    internal var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: PopsSpacing.sm) {
                ForEach(InventoryLifecycleScope.allCases) { candidate in
                    InventoryLifecycleScopeChip(
                        scope: candidate, isSelected: candidate == scope
                    ) { scope = candidate }
                }
            }
        }
        .accessibilityElement(children: .contain)
    }
}

private struct InventoryLifecycleScopeChip: View {
    let scope: InventoryLifecycleScope
    let isSelected: Bool
    let select: () -> Void

    var body: some View {
        Button(action: select) {
            Text(scope.rawValue)
                .font(.popsSubheadline.weight(.semibold))
                .padding(.horizontal, PopsSpacing.md)
                .padding(.vertical, PopsSpacing.sm)
                .foregroundStyle(isSelected ? Color.popsBackground : Color.popsForeground)
                .background(isSelected ? Color.popsInventory : Color.popsSurface, in: .capsule)
        }
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

/// What a search shows when it finds nothing at the current scope, worded so
/// the reader knows whether widening the scope would help.
internal struct InventoryLifecycleScopeEmptyState: View {
    internal let scope: InventoryLifecycleScope
    @Environment(\.inventoryLifecycleStyle) private var style

    internal var body: some View {
        EmptyStateView(message: message)
    }

    private var message: String {
        switch scope {
        case .active: "No active items match. " + hiddenHint
        case .all: "Nothing matches, active or not."
        case .inactiveOnly: "Nothing discarded, retired, lost or destroyed matches."
        }
    }

    private var hiddenHint: String {
        style.inactiveSearchVisibility == .hiddenByDefault
            ? "Discarded, retired and lost items are hidden here; try the Inactive chip."
            : ""
    }
}
