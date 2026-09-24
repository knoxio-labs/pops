import Testing

@testable import FeatureInventory

@MainActor
@Suite("Item detail's pending-screen routing")
internal struct InventoryItemDetailRoutingTests {
    @Test("Edit opens the real item form")
    func editOpensTheRealForm() {
        var opened: InventoryItemFormRequest?
        let itemForm = InventoryItemFormPresenter { opened = $0 }

        InventoryItemDetailRouting.present(.edit, itemId: "item-1", itemForm: itemForm)

        #expect(opened == .edit("item-1"))
    }

    @Test("Label it opens the real item form focused on the code field, not a placeholder")
    func labelOpensTheRealFormFocusedOnCode() {
        var opened: InventoryItemFormRequest?
        let itemForm = InventoryItemFormPresenter { opened = $0 }

        InventoryItemDetailRouting.present(.label, itemId: "item-1", itemForm: itemForm)

        #expect(opened == .labelling("item-1"))
    }

    @Test(
        "With no item form installed, nothing opens for either screen",
        arguments: [InventoryItemDetailPending.edit, .label]
    )
    func withNoInstalledFormOpensNothing(screen: InventoryItemDetailPending) {
        // No itemForm handed in at all: `present` must not crash reaching for
        // one, and there is no placeholder left to fall back to.
        InventoryItemDetailRouting.present(screen, itemId: "item-1", itemForm: nil)
    }
}
