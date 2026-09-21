import DesignSystem
import SwiftUI

extension EnvironmentValues {
    /// The colour Inventory's shared parts draw their accent in: the search
    /// bar, the query highlight, selection, the undo capsule. Amber on
    /// Inventory's own screens; a screen another family owns, such as the
    /// universal search, sets its own so one screen keeps one tint.
    @Entry internal var inventoryAccent: Color = .popsInventory
}
