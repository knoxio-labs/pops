import DesignSystem
import SwiftUI

/// The screen repeated physical work happens on: pack, unpack, check what is
/// still missing.
///
/// Contents can be added or removed whether the container is open, closed or
/// sealed — the interaction rule POPS-3979 and this ticket both hold — so
/// nothing here reads `access` to decide whether the add button is enabled.
/// What changes with `access` is only the actions section below it, which
/// ``InventoryActionSections`` already answers correctly for every state.
internal struct InventoryContainerWorkspaceView: View {
    internal let profile: InventoryContainerProfile

    internal var body: some View {
        List {
            InventoryContainerIdentitySection(profile: profile)
            InventoryContainerContentsSection(profile: profile)
            Section("Actions") { InventoryActionSections(item: profile.item) }
        }
        .playgroundInsetGroupedList()
        .navigationTitle(profile.item.name)
        .tint(.popsInventory)
    }
}
