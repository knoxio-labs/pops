import DesignSystem
import SwiftUI

extension EnvironmentValues {
    /// The colour Inventory's shared parts draw their accent in: the search
    /// bar, the query highlight, selection, the undo capsule. Amber on
    /// Inventory's own screens; a screen another family owns, such as the
    /// universal search, sets its own so one screen keeps one tint.
    @Entry internal var inventoryAccent: Color = .popsInventory
}

/// A selected row's tint, drawn as a view because the preference closure
/// that places it cannot read the environment itself.
internal struct InventorySelectionFill: View {
    @Environment(\.inventoryAccent) private var accent

    internal var body: some View {
        Rectangle().fill(accent.opacity(0.14))
    }
}
