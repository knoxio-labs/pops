import DesignSystem
import SwiftUI

/// The sheet the filter circle opens: one native form, a menu row per
/// filter, the inactive switch, and the sort when the list has one.
internal struct InventorySearchFilterSheet: View {
    @Binding internal var filter: InventorySearchFilter
    internal var sort: Binding<InventoryItemSort>?
    internal let types: [InventoryTypeName]
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
            .inventoryInsetGroupedList()
            .navigationTitle("Filters")
            .popsTitleDisplay(large: false)
            .inventoryLeadingBarItem {
                Button("Reset") { filter = InventorySearchFilter() }
                    .disabled(!filter.isActive)
            }
            .inventoryTrailingBarItem {
                Button("Done") { dismiss() }
                    .popsProminentGlassButton()
            }
            .popsMotion(value: filter)
        }
        .tint(.popsInventory)
        .presentationDetents([.large])
    }
}

/// Inventory's filter pickers and inactive toggle for use in a shared filter form.
public struct InventorySearchFilterFields<Header: View>: View {
    @Binding private var filter: InventorySearchFilter
    private let types: [InventoryTypeName]
    @ViewBuilder private let header: () -> Header

    /// Creates Inventory filter fields with a caller-provided section header.
    public init(
        filter: Binding<InventorySearchFilter>,
        types: [InventoryTypeName],
        @ViewBuilder header: @escaping () -> Header
    ) {
        _filter = filter
        self.types = types
        self.header = header
    }

    public var body: some View {
        Section {
            Picker("Placement", selection: $filter.placement) {
                ForEach(InventoryPlacementFilter.allCases) { Text($0.title).tag($0) }
            }
            Picker("Container", selection: $filter.containerState) {
                ForEach(InventoryContainerStateFilter.allCases) { Text($0.title).tag($0) }
            }
            Picker("Type", selection: $filter.type) {
                Text("Any").tag(InventoryTypeName?.none)
                ForEach(types) { Text($0.name).tag(InventoryTypeName?.some($0)) }
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
    /// Creates Inventory filter fields without a section header.
    public init(filter: Binding<InventorySearchFilter>, types: [InventoryTypeName]) {
        self.init(filter: filter, types: types) { EmptyView() }
    }
}
