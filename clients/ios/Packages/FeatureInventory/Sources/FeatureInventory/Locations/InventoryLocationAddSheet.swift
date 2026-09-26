import DesignSystem
import SwiftUI

/// Add, on a place's page: a new item placed directly in the place, or a new
/// place inside it.
///
/// Both open as sheets nested inside this one, and it installs its own
/// `inventoryItemFormPresentation` for the reason `InventoryStoreHereSheet`
/// gives: an ancestor's item-form sheet is not the topmost presentation once
/// this one is up.
internal struct InventoryLocationAddSheet: View {
    internal let tree: InventoryLocationTree
    internal let place: InventoryLocationNode
    internal let runner: InventoryCommandRunner

    internal var body: some View {
        NavigationStack {
            InventoryLocationAddRoot(tree: tree, place: place, runner: runner)
        }
        .presentationDetents([.height(InventoryChoiceStep.sheetHeight)])
        .tint(.popsInventory)
        .inventoryItemFormPresentation(store: runner.store)
    }
}

/// The sheet's root, inside the locally scoped item-form presentation so
/// `\.inventoryItemForm` here opens a sheet nested inside
/// `InventoryLocationAddSheet`.
private struct InventoryLocationAddRoot: View {
    let tree: InventoryLocationTree
    let place: InventoryLocationNode
    let runner: InventoryCommandRunner
    @State private var creatingPlace = false
    @Environment(\.inventoryItemForm) private var itemForm

    var body: some View {
        InventoryChoiceStep(
            title: "Add to \(place.name)",
            options: [
                InventoryChoiceOption(title: "New item", symbol: .item) {
                    itemForm?(.create(placement: .location(place.id)))
                },
                InventoryChoiceOption(title: "New place", symbol: .location) {
                    creatingPlace = true
                },
            ]
        )
        .sheet(isPresented: $creatingPlace) {
            InventoryLocationCreateSheet(tree: tree, runner: runner, parentID: place.id)
        }
    }
}
