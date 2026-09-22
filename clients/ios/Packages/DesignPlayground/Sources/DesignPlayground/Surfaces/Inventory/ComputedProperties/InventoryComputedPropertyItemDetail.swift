import DesignSystem
import SwiftUI

internal struct InventoryComputedPropertyItemDetail: View {
    internal var body: some View {
        List {
            Section("Item") {
                LabeledContent("Name", value: "Clear storage box")
                LabeledContent("Type", value: "Storage box")
                LabeledContent("Location", value: "Garage · Shelving unit")
            }
            Section("Properties") {
                LabeledContent("Width", value: "40 cm")
                LabeledContent("Height", value: "30 cm")
                LabeledContent("Depth", value: "25 cm")
                LabeledContent("Capacity", value: "30 L")
            }
        }
        .playgroundInsetGroupedList()
        .navigationTitle("Clear storage box")
        .playgroundTitleDisplay(large: false)
        .tint(.popsInventory)
    }
}
