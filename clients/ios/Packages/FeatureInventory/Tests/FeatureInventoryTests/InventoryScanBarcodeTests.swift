import AppCore
import Testing

@testable import FeatureInventory

/// A plain code no item holds as its own, resolved against the external
/// identifiers items carry: one holder opens, several are listed, none is
/// target missing.
@MainActor
@Suite("Inventory scan by barcode")
internal struct InventoryScanBarcodeTests {
    @Test("a barcode exactly one item carries opens that item and records the scan")
    func singleBarcodeOpens() async {
        let recents = InventoryScanTestSupport.freshDefaults()
        let model = InventoryScanTestSupport.model(
            items: [
                InventoryFixture.item(
                    "item-1", "Kettle", at: .hand, externalIds: Self.barcode("5012345678900")),
                InventoryFixture.item(
                    "item-2", "Toaster", at: .hand, externalIds: Self.barcode("5099999999999")),
            ], recents: recents)
        await model.start()

        model.didScan("5012345678900")
        await awaitObservedCondition { model.phase != .loading }

        guard case .found(let record) = model.phase else {
            Issue.record("expected .found, got \(model.phase)")
            return
        }
        #expect(record.id == "item-1")
        #expect(model.opened == .item("item-1"))
        #expect(InventoryScanTestSupport.scanned(in: recents) == ["item-1"])
    }

    @Test("a barcode on a single container opens the container page")
    func singleBarcodeOnContainerOpensContainer() async {
        let model = InventoryScanTestSupport.model(items: [
            InventoryFixture.item(
                "box-1", "Crate", at: .hand, access: .open,
                externalIds: Self.barcode("5012345678900"))
        ])
        await model.start()

        model.didScan("5012345678900")
        await awaitObservedCondition { model.phase != .loading }

        #expect(model.opened == .container("box-1"))
    }

    @Test("a barcode several items carry lists them by name without opening any")
    func sharedBarcodeListsMatches() async {
        let recents = InventoryScanTestSupport.freshDefaults()
        let model = InventoryScanTestSupport.model(
            items: [
                InventoryFixture.item(
                    "item-2", "Mug two", at: .hand, externalIds: Self.barcode("5012345678900")),
                InventoryFixture.item(
                    "item-1", "Mug one", at: .hand, externalIds: Self.barcode("5012345678900")),
            ], recents: recents)
        await model.start()

        model.didScan("5012345678900")
        await awaitObservedCondition { model.phase != .loading }

        guard case .matches(let records) = model.phase else {
            Issue.record("expected .matches, got \(model.phase)")
            return
        }
        #expect(records.map(\.id) == ["item-1", "item-2"])
        #expect(model.opened == nil)
        #expect(InventoryScanTestSupport.scanned(in: recents).isEmpty)
    }

    @Test("an item's own code wins over the same text as another item's barcode")
    func ownCodeWinsOverBarcode() async {
        let model = InventoryScanTestSupport.model(items: [
            InventoryFixture.item("item-1", "Drill", at: .hand, code: "ABC-123"),
            InventoryFixture.item(
                "item-2", "Kettle", at: .hand, externalIds: Self.barcode("ABC-123")),
        ])
        await model.start()

        model.didScan("ABC-123")
        await awaitObservedCondition { model.phase != .loading }

        guard case .found(let record) = model.phase else {
            Issue.record("expected .found, got \(model.phase)")
            return
        }
        #expect(record.id == "item-1")
        #expect(model.opened == nil)
    }

    @Test("a barcode carried only by a deleted item is target missing")
    func tombstonedBarcodeIsTargetMissing() async {
        let model = InventoryScanTestSupport.model(items: [
            InventoryFixture.item(
                "item-1", "Kettle", at: .hand, deleted: true,
                externalIds: Self.barcode("5012345678900"))
        ])
        await model.start()

        model.didScan("5012345678900")
        await awaitObservedCondition { model.phase != .loading }

        #expect(model.phase == .targetMissing)
        #expect(model.opened == nil)
    }

    private static func barcode(_ value: String) -> [InventoryExternalIdentifier] {
        [InventoryExternalIdentifier(kind: "barcode", value: value)]
    }
}
