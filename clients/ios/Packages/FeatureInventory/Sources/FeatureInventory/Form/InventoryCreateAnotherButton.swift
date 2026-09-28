import SwiftUI

internal struct InventoryCreateAnotherButton: View {
    let model: InventoryItemFormModel

    var body: some View {
        Button {
            Task { _ = await model.submitAndPrepareForAnother() }
        } label: {
            Image(systemName: "plus")
        }
        .disabled(!model.canSubmit)
        .accessibilityLabel("Create another")
        .accessibilityIdentifier(InventoryAccessibility.itemCreateAnother)
    }
}
