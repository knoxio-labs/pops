import DesignSystem
import SwiftUI

/// The contents' search: the shared Mail-style bar, its filter narrowing by
/// type and by how recently something went in.
internal struct InventoryContainerSearchBar: View {
    @Binding internal var query: String
    @Binding internal var filter: InventoryContainerContentsFilter
    internal let types: [String]

    internal var body: some View {
        InventorySearchBar(query: $query, isFiltered: filter.isActive, filterSummary: summary) {
            Picker(selection: $filter.type) {
                Text("Any type").tag(String?.none)
                ForEach(types, id: \.self) { type in
                    Text(type).tag(String?.some(type))
                }
            } label: {
                Label {
                    Text("Type")
                } icon: {
                    InventorySymbol.label.image
                }
            }
            .pickerStyle(.menu)
            Toggle(isOn: $filter.recentOnly) {
                Label("Recently added", systemImage: "clock")
            }
            if filter.isActive {
                Divider()
                Button("Clear filters") {
                    filter = InventoryContainerContentsFilter()
                }
            }
        }
        .padding(.horizontal, PopsSpacing.lg)
    }

    private var summary: String {
        [filter.type, filter.recentOnly ? "Recently added" : nil].compactMap(\.self)
            .joined(separator: ", ")
    }
}
