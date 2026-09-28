import DesignSystem
import SwiftUI

internal struct InventoryCreateButton: View {
    let model: InventoryItemFormModel
    let onCreated: () -> Void

    var body: some View {
        Button {
            Task {
                if await model.submit() { onCreated() }
            }
        } label: {
            Image(systemName: "checkmark")
        }
        .popsProminentGlassButton()
        .disabled(!model.canSubmit)
        .accessibilityLabel("Create")
        .accessibilityIdentifier(InventoryAccessibility.itemCreate)
    }
}
