import AppCore
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Inventory code link scanning")
internal struct InventoryCodeLinkScanTests {
    @Test("a code link resolves through the code index", arguments: ["ABC-123", "abc-123"])
    func codeLinkFound(_ code: String) async {
        let model = InventoryScanTestSupport.model(items: [
            InventoryFixture.item("item-1", "Drill", at: .hand, code: "ABC-123")
        ])
        await model.start()
        model.didScan("pops-i://\(code)")
        await model.pendingLookup?.value
        guard case .found(let record) = model.phase else {
            Issue.record("expected found, got \(model.phase)")
            return
        }
        #expect(record.id == "item-1")
    }

    @Test("a malformed code link is not a plain code")
    func malformedCodeLink() async {
        let model = InventoryScanTestSupport.model()
        await model.start()
        model.didScan("pops-i://ABC-123/extra")
        #expect(model.phase == .notPops)
        #expect(model.pendingLookup == nil)
    }

    @Test("a code link never falls through to an external identifier")
    func codeLinkDoesNotResolveBarcode() async {
        let model = InventoryScanTestSupport.model(items: [
            InventoryFixture.item(
                "item-1", "Drill", at: .hand,
                externalIds: [InventoryExternalIdentifier(kind: "barcode", value: "ABC-123")])
        ])
        await model.start()
        model.didScan("pops-i://ABC-123")
        await model.pendingLookup?.value
        #expect(model.phase == .targetMissing)
        #expect(model.opened == nil)
    }
}
