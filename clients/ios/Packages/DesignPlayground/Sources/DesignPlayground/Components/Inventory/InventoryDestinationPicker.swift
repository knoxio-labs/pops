import DesignSystem
import SwiftUI

/// One place an item could go: a container, a location, or a location that
/// does not exist yet.
internal struct InventoryDestination: Identifiable, Equatable {
    internal enum Kind: Equatable {
        case container
        case location
        /// Offered only while a home is being built out during unpacking, so
        /// "put it somewhere new" is a destination rather than a detour to a
        /// different screen.
        case newLocation
    }

    internal let id: String
    internal let name: String
    internal let kind: Kind

    internal var symbol: InventorySymbol {
        switch kind {
        case .container: .openContainer
        case .location, .newLocation: .location
        }
    }
}

/// Where an item can go, put somewhere else: recent destinations first, then
/// the full choice of open containers and locations.
///
/// Recent first because the flows this answers, put back somewhere other
/// than where it was, or place an unpacked item, most often repeat the last
/// destination or one very like it. The full lists are one scroll away, never
/// hidden behind a second sheet.
internal struct InventoryDestinationPickerSheet: View {
    internal let itemName: String
    internal let recent: [InventoryDestination]
    internal let containers: [InventoryDestination]
    internal let locations: [InventoryDestination]
    internal let onChoose: (InventoryDestination) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var newLocationName = ""
    @State private var isCreatingLocation = false

    internal var body: some View {
        NavigationStack {
            List {
                if !recent.isEmpty {
                    Section("Recent") { rows(recent) }
                }
                if !containers.isEmpty {
                    Section("Open containers") { rows(containers) }
                }
                Section("Locations") {
                    rows(locations)
                    newLocationRow
                }
            }
            .playgroundInsetGroupedList()
            .tint(.popsInventory)
            .navigationTitle("Move \(itemName)")
            .playgroundTitleDisplay(large: false)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func rows(_ destinations: [InventoryDestination]) -> some View {
        ForEach(destinations) { destination in
            Button {
                onChoose(destination)
            } label: {
                Label(destination.name, systemImage: destination.symbol.system)
            }
        }
    }

    @ViewBuilder private var newLocationRow: some View {
        if isCreatingLocation {
            HStack {
                TextField("New location", text: $newLocationName)
                Button("Add") {
                    guard !newLocationName.trimmingCharacters(in: .whitespaces).isEmpty else {
                        return
                    }
                    onChoose(
                        InventoryDestination(
                            id: "new-\(newLocationName)", name: newLocationName, kind: .newLocation
                        ))
                }
                .disabled(newLocationName.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        } else {
            Button {
                isCreatingLocation = true
            } label: {
                Label("Create a new location", systemImage: "plus")
            }
        }
    }
}
