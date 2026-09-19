import Testing

@testable import FeatureInventory

@MainActor
@Suite("Item detail's pending-screen routing")
internal struct InventoryItemDetailRoutingTests {
    @Test("Edit opens the real item form rather than the placeholder sheet")
    func editOpensTheRealForm() {
        var opened: InventoryItemFormRequest?
        var pending: InventoryItemDetailPending?
        let itemForm = InventoryItemFormPresenter { opened = $0 }

        InventoryItemDetailRouting.present(.edit, itemId: "item-1", itemForm: itemForm) {
            pending = $0
        }

        #expect(opened == .edit("item-1"))
        #expect(pending == nil)
    }

    @Test("Edit with no item form installed opens nothing, rather than the wrong sheet")
    func editWithNoInstalledFormOpensNothing() {
        var pending: InventoryItemDetailPending?

        InventoryItemDetailRouting.present(.edit, itemId: "item-1", itemForm: nil) {
            pending = $0
        }

        #expect(pending == nil)
    }

    @Test(
        "Every other pending screen still opens the placeholder sheet",
        arguments: [
            InventoryItemDetailPending.move, .storeHere, .label, .printLabel,
        ]
    )
    func everyOtherScreenStillFallsBackToThePlaceholder(screen: InventoryItemDetailPending) {
        var opened: InventoryItemFormRequest?
        var pending: InventoryItemDetailPending?
        let itemForm = InventoryItemFormPresenter { opened = $0 }

        InventoryItemDetailRouting.present(screen, itemId: "item-1", itemForm: itemForm) {
            pending = $0
        }

        #expect(opened == nil)
        #expect(pending == screen)
    }
}
