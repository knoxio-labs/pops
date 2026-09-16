import DesignSystem
import SwiftUI

/// Choosing a destination: the picker ``InventoryMoveDestinationSheet``
/// stands in for today, extended with recent and favourite destinations, a
/// search, and creating a new place inline without leaving the move.
internal struct InventoryLocationPickerView: View {
    internal let tree: InventoryLocationTree
    internal let style: InventoryLocationStyle
    internal let itemName: String
    internal let showsRecentsAndFavorites: Bool
    internal let excludedIDs: Set<String>
    @State private var query = ""
    @State private var creatingName = ""
    @State private var isCreating = false
    @Environment(\.dismiss) private var dismiss

    internal init(
        tree: InventoryLocationTree,
        style: InventoryLocationStyle,
        itemName: String,
        showsRecentsAndFavorites: Bool = true,
        excludedIDs: Set<String> = []
    ) {
        self.tree = tree
        self.style = style
        self.itemName = itemName
        self.showsRecentsAndFavorites = showsRecentsAndFavorites
        self.excludedIDs = excludedIDs
    }

    private var options: [InventoryDestinationOption] {
        InventoryDestinationChooser.options(
            tree: tree,
            recentIDs: showsRecentsAndFavorites
                ? InventoryLocationFixtures.recentDestinationIDs : [],
            favoriteIDs: showsRecentsAndFavorites
                ? InventoryLocationFixtures.favoriteDestinationIDs : [],
            openContainers: InventoryLocationFixtures.openContainerDestinations,
            excluding: excludedIDs)
    }

    private var visibleKinds: [InventoryDestinationOption.Kind] {
        guard style.picker == .compact, query.isEmpty else {
            return InventoryDestinationOption.Kind.allCases
        }
        return [.recentLocation, .favoriteLocation, .openContainer]
    }

    private var filtered: [InventoryDestinationOption] {
        let matches =
            query.isEmpty
            ? options : options.filter { $0.title.localizedCaseInsensitiveContains(query) }
        return matches.filter { visibleKinds.contains($0.kind) }
    }

    internal var body: some View {
        NavigationStack {
            List {
                if isCreating { createSection }
                ForEach(InventoryDestinationOption.Kind.allCases, id: \.self) { kind in
                    let matches = filtered.filter { $0.kind == kind }
                    if !matches.isEmpty {
                        Section(title(for: kind)) {
                            ForEach(matches) { option in
                                Button {
                                    dismiss()
                                } label: {
                                    row(option)
                                }
                            }
                        }
                    }
                }
            }
            .searchable(text: $query, prompt: "Search destinations")
            .navigationTitle("Move \(itemName)")
            .playgroundTitleDisplay(large: false)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .primaryAction) {
                    Button("New place") { isCreating = true }
                }
            }
        }
    }

    private var createSection: some View {
        Section("New place") {
            TextField("Name", text: $creatingName)
            Button("Create and move here") { dismiss() }
                .disabled(creatingName.isEmpty)
        }
    }

    private func row(_ option: InventoryDestinationOption) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(option.title).foregroundStyle(Color.popsForeground)
            if !option.path.isEmpty {
                Text(option.path)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
    }

    private func title(for kind: InventoryDestinationOption.Kind) -> String {
        switch kind {
        case .recentLocation: "Recent"
        case .favoriteLocation: "Favourites"
        case .openContainer: "Open containers"
        case .location: "All locations"
        }
    }
}
