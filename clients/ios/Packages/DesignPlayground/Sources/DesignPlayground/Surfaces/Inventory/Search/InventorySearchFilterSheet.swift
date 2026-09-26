import DesignSystem
import SwiftUI

/// The sheet the Items browser's filter circle opens: one native form, the
/// sort, then Inventory's filter fields.
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
                InventorySearchFilterFields(filter: $filter, types: types)
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

/// Inventory's filters as form sections: a menu row per filter, then the
/// inactive switch. Shared by the Items browser's sheet and the universal
/// search's, which heads them with the pillar.
internal struct InventorySearchFilterFields<Header: View>: View {
    @Binding internal var filter: InventorySearchFilter
    internal let types: [String]
    @ViewBuilder internal let header: () -> Header

    internal var body: some View {
        Section {
            Picker("Placement", selection: $filter.placement) {
                ForEach(InventoryPlacementFilter.allCases) { Text($0.title).tag($0) }
            }
            Picker("Container", selection: $filter.containerState) {
                ForEach(InventoryContainerStateFilter.allCases) {
                    Text($0.title).tag($0)
                }
            }
            NavigationLink {
                InventoryFormTypePicker(
                    selection: $filter.typeName, additionalNames: types)
            } label: {
                HStack {
                    Text("Type")
                    Spacer(minLength: PopsSpacing.sm)
                    Text(filter.typeName ?? "Any")
                        .foregroundStyle(Color.popsMutedForeground)
                }
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
        } header: {
            header()
        }
        .pickerStyle(.menu)
        Section {
            Toggle("Include inactive", isOn: $filter.includesInactive)
        }
    }
}

extension InventorySearchFilterFields where Header == EmptyView {
    internal init(filter: Binding<InventorySearchFilter>, types: [String]) {
        self.init(filter: filter, types: types) { EmptyView() }
    }
}
