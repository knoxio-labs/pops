import DesignSystem
import SwiftUI

internal struct InventoryFormTypePicker: View {
    @Binding internal var selection: String?
    internal let options: [InventoryFormTypeOption]
    internal let noneTitle: String?
    internal let noneAccessibilityIdentifier: String?
    private let initialQuery: String
    @Environment(\.dismiss) private var dismiss
    @State private var query: String

    internal init(
        selection: Binding<String?>, options: [InventoryFormTypeOption], title: String = "Type",
        noneTitle: String? = nil, noneAccessibilityIdentifier: String? = nil, query: String = ""
    ) {
        _selection = selection
        self.options = options
        self.noneTitle = noneTitle
        self.noneAccessibilityIdentifier = noneAccessibilityIdentifier
        navigationTitle = title
        initialQuery = query
        _query = State(initialValue: query)
    }

    private let navigationTitle: String

    internal var body: some View {
        List {
            if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                rootRows
            } else {
                searchRows
            }
        }
        .inventoryInsetGroupedList()
        .navigationTitle(navigationTitle)
        .searchable(text: $query, prompt: "Search types")
        .onAppear { query = initialQuery }
    }

    @ViewBuilder private var rootRows: some View {
        Section {
            if let noneTitle {
                noneRow(title: noneTitle)
            }
            ForEach(children(of: nil)) { option in
                nodeRow(option)
            }
        }
    }

    @ViewBuilder private var searchRows: some View {
        Section {
            ForEach(searchOptions) { option in
                Button {
                    choose(option.id)
                } label: {
                    optionLabel(
                        name: option.path, isSelected: selection == option.id,
                        isArchived: option.isArchived)
                }
                .disabled(option.isArchived)
                .accessibilityIdentifier(option.accessibilityIdentifier)
            }
        }
    }

    private func level(for parentID: String) -> some View {
        List {
            if let parent = options.first(where: { $0.id == parentID }) {
                Section {
                    Button {
                        choose(parent.id)
                    } label: {
                        optionLabel(
                            name: "Choose \(parent.label)", isSelected: selection == parent.id,
                            isArchived: parent.isArchived)
                    }
                    .disabled(parent.isArchived)
                    .accessibilityIdentifier(parent.accessibilityIdentifier)
                    ForEach(children(of: parentID)) { option in
                        nodeRow(option)
                    }
                }
            }
        }
        .inventoryInsetGroupedList()
        .navigationTitle(options.first(where: { $0.id == parentID })?.label ?? navigationTitle)
    }

    @ViewBuilder private func nodeRow(_ option: InventoryFormTypeOption) -> some View {
        if option.hasChildren {
            NavigationLink {
                AnyView(level(for: option.id))
            } label: {
                optionLabel(name: option.label, isSelected: selection == option.id)
            }
            .accessibilityIdentifier(option.accessibilityIdentifier)
        } else {
            Button {
                choose(option.id)
            } label: {
                optionLabel(
                    name: option.label, isSelected: selection == option.id,
                    isArchived: option.isArchived)
            }
            .disabled(option.isArchived)
            .accessibilityIdentifier(option.accessibilityIdentifier)
        }
    }

    @ViewBuilder private func noneRow(title: String) -> some View {
        if let identifier = noneAccessibilityIdentifier {
            Button {
                choose(nil)
            } label: {
                optionLabel(name: title, isSelected: selection == nil)
            }
            .accessibilityIdentifier(identifier)
        } else {
            Button {
                choose(nil)
            } label: {
                optionLabel(name: title, isSelected: selection == nil)
            }
        }
    }

    private var searchOptions: [InventoryFormTypeOption] {
        let query = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return
            options
            .filter { $0.path.localizedCaseInsensitiveContains(query) }
            .sorted { left, right in
                switch left.path.localizedCaseInsensitiveCompare(right.path) {
                case .orderedAscending: true
                case .orderedDescending: false
                case .orderedSame:
                    left.id.localizedCaseInsensitiveCompare(right.id) == .orderedAscending
                }
            }
    }

    private func children(of parentID: String?) -> [InventoryFormTypeOption] {
        options
            .filter { $0.parentID == parentID }
            .sorted { left, right in
                switch left.label.localizedCaseInsensitiveCompare(right.label) {
                case .orderedAscending: true
                case .orderedDescending: false
                case .orderedSame:
                    left.id.localizedCaseInsensitiveCompare(right.id) == .orderedAscending
                }
            }
    }

    private func optionLabel(name: String, isSelected: Bool, isArchived: Bool = false) -> some View
    {
        HStack {
            Text(name)
                .foregroundStyle(
                    isArchived ? Color.popsMutedForeground : Color.popsForeground
                )
            Spacer(minLength: PopsSpacing.sm)
            if isSelected {
                Image(systemName: "checkmark")
                    .foregroundStyle(Color.popsInventory)
                    .accessibilityHidden(true)
            }
        }
    }

    private func choose(_ id: String?) {
        dismiss()
        Task { @MainActor in
            selection = id
        }
    }
}
