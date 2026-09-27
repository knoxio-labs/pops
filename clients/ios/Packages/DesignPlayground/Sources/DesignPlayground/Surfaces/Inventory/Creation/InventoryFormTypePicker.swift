import DesignSystem
import SwiftUI

internal struct InventoryFormTypePicker: View {
    @Binding internal var selection: String?
    internal let additionalNames: [String]
    internal let showsNoneOption: Bool
    internal let noneOptionTitle: String
    private let initialQuery: String
    @Environment(\.dismiss) private var dismiss
    @State private var query: String

    internal init(
        selection: Binding<String?>, additionalNames: [String] = [], query: String = "",
        showsNoneOption: Bool = true, noneOptionTitle: String = InventoryFormType.none
    ) {
        _selection = selection
        self.additionalNames = additionalNames
        self.showsNoneOption = showsNoneOption
        self.noneOptionTitle = noneOptionTitle
        initialQuery = query
        _query = State(initialValue: query)
    }

    internal var body: some View {
        List {
            if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                rootRows
            } else {
                searchRows
            }
        }
        .playgroundInsetGroupedList()
        .navigationTitle("Type")
        .searchable(text: $query, prompt: "Search types")
        .navigationDestination(for: String.self) { parentID in
            level(for: parentID)
        }
        .onAppear { query = initialQuery }
    }

    @ViewBuilder private var rootRows: some View {
        Section {
            if showsNoneOption {
                Button {
                    choose(nil)
                } label: {
                    optionLabel(name: noneOptionTitle, isSelected: selection == nil)
                }
            }
            ForEach(InventoryFormType.children(of: nil)) { node in
                nodeRow(node)
            }
            ForEach(
                InventoryFormType.standaloneNames(additionalNames: additionalNames), id: \.self
            ) { name in
                Button {
                    choose(name)
                } label: {
                    optionLabel(name: name, isSelected: selection == name)
                }
            }
        }
    }

    @ViewBuilder private var searchRows: some View {
        Section {
            ForEach(
                InventoryFormType.searchOptions(
                    query: query, additionalNames: additionalNames)
            ) { option in
                Button {
                    choose(option.name)
                } label: {
                    optionLabel(
                        name: option.path, isSelected: selection == option.name,
                        isArchived: option.isArchived)
                }
                .disabled(option.isArchived)
            }
        }
    }

    private func level(for parentID: String) -> some View {
        List {
            if let parentNode = InventoryFormType.node(withID: parentID) {
                Section {
                    Button {
                        choose(parentNode.name)
                    } label: {
                        optionLabel(
                            name: "Choose \(parentNode.name)",
                            isSelected: selection == parentNode.name)
                    }
                    ForEach(InventoryFormType.children(of: parentID)) { node in
                        nodeRow(node)
                    }
                }
            }
        }
        .playgroundInsetGroupedList()
        .navigationTitle(InventoryFormType.node(withID: parentID)?.name ?? "Type")
    }

    @ViewBuilder private func nodeRow(_ node: InventoryFormTypeNode) -> some View {
        if InventoryFormType.hasChildren(node) {
            NavigationLink(value: node.id) {
                optionLabel(name: node.name, isSelected: selection == node.name)
            }
        } else {
            Button {
                choose(node.name)
            } label: {
                optionLabel(
                    name: node.name, isSelected: selection == node.name,
                    isArchived: node.isArchived)
            }
            .disabled(node.isArchived)
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

    private func choose(_ name: String?) {
        selection = name
        dismiss()
    }
}
