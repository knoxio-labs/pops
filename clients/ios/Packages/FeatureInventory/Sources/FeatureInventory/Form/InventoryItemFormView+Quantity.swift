import DesignSystem
import SwiftUI

/// ADR-002 D3: a container's quantity is always 1, so its row locks instead
/// of offering a stepper that would end in a refused write.
extension InventoryItemFormView {
    @ViewBuilder internal var quantityRow: some View {
        if model.selectedTypeIsContainer {
            LabeledContent("Quantity") { Text("1").foregroundStyle(Color.popsMutedForeground) }
        } else {
            InventoryFormQuantityRow(count: $model.draft.quantity)
        }
    }
}
