import DesignSystem
import SwiftUI

/// The sheet the filter circle opens: one native form, a menu row per
/// filter, the inactive switch, and the sort when the list has one.
internal struct InventorySearchFilterSheet: View {
    @Binding internal var filter: InventorySearchFilter
    internal var sort: Binding<InventoryItemSort>?
    internal let types: [String]
    @Environment(\.dismiss) private var dismiss

    internal var body: some View {
        NavigationStack {
            Form {
                if let sort {
                    Section {
                        Picker("Sort", selection: sort) {
                            ForEach(InventoryItemSort.allCases) { Text($0.title).tag($0) }
                        }
                    }
                }
                Section {
                    Picker("Placement", selection: $filter.placement) {
                        ForEach(InventoryPlacementFilter.allCases) { Text($0.title).tag($0) }
                    }
                    Picker("Container", selection: $filter.containerState) {
                        ForEach(InventoryContainerStateFilter.allCases) {
                            Text($0.title).tag($0)
                        }
                    }
                    Picker("Type", selection: $filter.typeName) {
                        Text("Any").tag(String?.none)
                        ForEach(types, id: \.self) { Text($0).tag(String?.some($0)) }
                    }
                    Picker("Quantity", selection: $filter.quantity) {
                        ForEach(InventoryQuantityFilter.allCases) { Text($0.title).tag($0) }
                    }
                    Picker("Missing", selection: $filter.missing) {
                        ForEach(InventoryMissingFilter.allCases) { Text($0.title).tag($0) }
                    }
                    Picker("Sync", selection: $filter.sync) {
                        ForEach(InventorySyncFilter.allCases) { Text($0.title).tag($0) }
                    }
                }
                .pickerStyle(.menu)
                Section {
                    Toggle("Include inactive", isOn: $filter.includesInactive)
                }
            }
            .playgroundInsetGroupedList()
            .navigationTitle("Filters")
            .playgroundTitleDisplay(large: false)
            .playgroundLeadingBarItem {
                Button("Reset") { filter = InventorySearchFilter() }
                    .disabled(!filter.isActive)
            }
            .playgroundTrailingBarItem {
                Button("Done") { dismiss() }
                    .playgroundProminentGlassButton()
            }
            .inventoryMotion(value: filter)
        }
        .tint(.popsInventory)
        .presentationDetents([.large])
    }
}
