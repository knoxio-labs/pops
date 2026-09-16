import DesignSystem
import SwiftUI

/// Every container-capable item, derived rather than kept as its own list —
/// a container is an item with a capability (ADR-001), so this browser is a
/// filter over the catalogue, not a second catalogue.
internal struct InventoryContainerBrowserView: View {
    internal let profiles: [InventoryContainerProfile]

    internal var body: some View {
        List {
            if containers.isEmpty {
                InventoryStateNotice(kind: .empty)
            } else {
                section("Open", profiles: filtered { $0.item.access == .open })
                section("Closed and sealed", profiles: filtered { $0.item.access != .open })
                section("No longer active", profiles: retired)
            }
        }
        .playgroundInsetGroupedList()
        .navigationTitle("Containers")
        .tint(.popsInventory)
    }

    private var containers: [InventoryContainerProfile] { profiles.filter { $0.item.isContainer } }

    private func filtered(
        _ matches: (InventoryContainerProfile) -> Bool
    ) -> [InventoryContainerProfile] {
        containers.filter { $0.item.lifecycle == .active && matches($0) }
    }

    private var retired: [InventoryContainerProfile] {
        containers.filter { $0.item.lifecycle != .active }
    }

    @ViewBuilder
    private func section(_ title: String, profiles: [InventoryContainerProfile]) -> some View {
        if !profiles.isEmpty {
            Section(title) {
                ForEach(profiles) { profile in
                    NavigationLink {
                        InventoryContainerDetailView(profile: profile)
                    } label: {
                        InventoryItemRow(item: profile.item)
                    }
                }
            }
        }
    }
}
