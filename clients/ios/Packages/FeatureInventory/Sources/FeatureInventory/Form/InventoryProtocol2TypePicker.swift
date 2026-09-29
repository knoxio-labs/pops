import AppCore
import SwiftUI

internal struct InventoryProtocol2TypePicker: View {
    let model: InventoryItemFormModel
    let catalogue: InventoryCatalogueSnapshot
    let selected: InventoryProtocol2Draft?
    @State private var pickerIsPresented = false

    internal var body: some View {
        Button {
            pickerIsPresented = true
        } label: {
            LabeledContent("Type") {
                Text(selectedLabel)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .buttonStyle(.plain)
        .navigationDestination(isPresented: $pickerIsPresented) {
            InventoryFormTypePicker(
                selection: Binding(
                    get: { selected?.typeId }, set: { model.selectProtocol2Type($0) }),
                options: InventoryFormTypeOptions.protocol2All(
                    catalogue, selectedId: selected?.typeId),
                noneTitle: model.offersNoType ? "No type yet" : nil,
                noneAccessibilityIdentifier: model.offersNoType
                    ? InventoryAccessibility.itemTypeNone : nil,
                onChoose: { id in
                    model.selectProtocol2Type(id)
                    pickerIsPresented = false
                })
        }
        .accessibilityIdentifier(InventoryAccessibility.itemTypePicker)
    }

    private var selectedLabel: String {
        guard let typeId = selected?.typeId,
            let type = catalogue.effectiveType(id: typeId)
        else { return "No type yet" }
        return type.label
    }
}
