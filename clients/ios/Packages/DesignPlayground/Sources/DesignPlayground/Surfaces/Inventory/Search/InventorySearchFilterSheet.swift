import DesignSystem
import SwiftUI

/// The sheet the filter/sort control opens: every filter grouped the way the
/// ticket names them, and the sort choice below.
internal struct InventorySearchFilterSheet: View {
    @Binding internal var activeFilters: Set<InventorySearchFilter>
    @Binding internal var sort: InventorySearchSort

    internal var body: some View {
        List {
            ForEach(sections, id: \.self) { section in
                Section(section) {
                    ForEach(filters(in: section)) { filter in
                        InventorySearchFilterRow(
                            filter: filter, isOn: activeFilters.contains(filter),
                            toggle: { toggle(filter) })
                    }
                }
            }
            Section("Sort") {
                Picker("Sort", selection: $sort) {
                    ForEach(InventorySearchSort.allCases) { sort in
                        Text(sort.title).tag(sort)
                    }
                }
                .pickerStyle(.inline)
                .labelsHidden()
            }
        }
        .playgroundInsetGroupedList()
        .navigationTitle("Filter and sort")
        .playgroundTitleDisplay(large: false)
    }

    private var sections: [String] {
        var seen: [String] = []
        for filter in InventorySearchFilter.allCases where !seen.contains(filter.section) {
            seen.append(filter.section)
        }
        return seen
    }

    private func filters(in section: String) -> [InventorySearchFilter] {
        InventorySearchFilter.allCases.filter { $0.section == section }
    }

    private func toggle(_ filter: InventorySearchFilter) {
        if activeFilters.contains(filter) {
            activeFilters.remove(filter)
        } else {
            activeFilters.insert(filter)
        }
    }
}

/// One filter, as a row with its own checkmark rather than a system toggle ,
/// several of these are on at once, which is what a list of checkmarks says
/// and a list of switches does not.
internal struct InventorySearchFilterRow: View {
    internal let filter: InventorySearchFilter
    internal let isOn: Bool
    internal let toggle: () -> Void

    internal var body: some View {
        Button(action: toggle) {
            HStack {
                Text(filter.title).foregroundStyle(Color.popsForeground)
                Spacer(minLength: PopsSpacing.sm)
                if isOn {
                    Image(systemName: "checkmark").foregroundStyle(Color.popsInventory)
                }
            }
        }
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

/// The active filters, as chips above the results, the fast way to remove
/// one without reopening the sheet.
internal struct InventorySearchFilterChips: View {
    internal let filters: Set<InventorySearchFilter>
    internal let onRemove: (InventorySearchFilter) -> Void

    internal var body: some View {
        if !filters.isEmpty {
            InventoryChipFlow(spacing: PopsSpacing.xs) {
                ForEach(Array(filters), id: \.self) { filter in
                    Button {
                        onRemove(filter)
                    } label: {
                        Label(filter.title, systemImage: "xmark")
                            .font(.popsCaption.weight(.semibold))
                            .labelStyle(.trailingIcon)
                    }
                    .foregroundStyle(Color.popsInventory)
                    .padding(.horizontal, PopsSpacing.sm)
                    .padding(.vertical, PopsSpacing.xs)
                    .background(Color.popsInventory.opacity(0.14), in: .capsule)
                }
            }
        }
    }
}

extension LabelStyle where Self == TrailingIconLabelStyle {
    fileprivate static var trailingIcon: TrailingIconLabelStyle { TrailingIconLabelStyle() }
}

/// A filter chip's icon reads as "remove" after the word, not before it.
private struct TrailingIconLabelStyle: LabelStyle {
    fileprivate func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: PopsSpacing.xs) {
            configuration.title
            configuration.icon
        }
    }
}
