import AppCore
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

    @Test("Duplicate opens a new-item form copying this item, not an edit of it")
    func duplicateOpensACopy() {
        var opened: InventoryItemFormRequest?
        let itemForm = InventoryItemFormPresenter { opened = $0 }

        InventoryItemDetailRouting.present(.duplicate, itemId: "item-1", itemForm: itemForm)

        #expect(opened == .duplicate("item-1"))
    }

    @Test(
        "the More menu offers Duplicate wherever it offers the item's other writes",
        arguments: [InventoryLifecycle.active, .retired, .discarded, .lost])
    func menuOffersDuplicate(lifecycle: InventoryLifecycle) {
        #expect(InventoryItemDetailMenu.offersDuplicate(lifecycle))
    }

    @Test(
        "a destroyed item, or one in a lifecycle this build does not know, is not offered Duplicate",
        arguments: [InventoryLifecycle.destroyed, .unrecognised("melted")])
    func menuHidesDuplicate(lifecycle: InventoryLifecycle) {
        #expect(!InventoryItemDetailMenu.offersDuplicate(lifecycle))
        #expect(
            InventoryLifecycleMenuEntry.entries(
                lifecycle: lifecycle, quantity: InventoryQuantity(count: 1)
            ).isEmpty)
    }

    @Test(
        "With no item form installed, nothing opens for any screen",
        arguments: [InventoryItemDetailPending.edit, .label, .duplicate]
    )
    func withNoInstalledFormOpensNothing(screen: InventoryItemDetailPending) {
        // No itemForm handed in at all: `present` must not crash reaching for
        // one, and there is no placeholder left to fall back to.
        InventoryItemDetailRouting.present(screen, itemId: "item-1", itemForm: nil)
    }
}
