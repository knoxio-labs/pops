import AppCore
import SwiftUI

internal struct InventoryProtocol2TypePicker: View {
    let model: InventoryItemFormModel
    let catalogue: InventoryCatalogueSnapshot
    let selected: InventoryProtocol2Draft?

    internal var body: some View {
        Picker(
            "Type",
            selection: Binding(
                get: { selected?.typeId }, set: { model.selectProtocol2Type($0) })
        ) {
            if model.offersNoType {
                Text("No type yet")
                    .tag(String?.none)
                    .accessibilityIdentifier(InventoryAccessibility.itemTypeNone)
            }
            let options = InventoryFormTypeOptions.protocol2(
                catalogue, selectedId: selected?.typeId)
            ForEach(options) { option in
                Text(option.label)
                    .tag(Optional(option.id))
                    .accessibilityIdentifier(option.accessibilityIdentifier)
            }
        }
        .pickerStyle(.menu)
        .accessibilityIdentifier(InventoryAccessibility.itemTypePicker)
    }
}
