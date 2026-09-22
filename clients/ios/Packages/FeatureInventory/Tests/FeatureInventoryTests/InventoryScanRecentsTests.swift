import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Inventory scan recents")
internal struct InventoryScanRecentsTests {
    @Test("scanning the same found item again moves one entry to the front")
    func duplicateFoundCode() async {
        let recents = freshDefaults()
        InventorySearchRecents.recordingScan("older", in: recents)

        for _ in 0..<2 {
            let current = model(
                items: [InventoryFixture.item("item-1", "Drill", at: .hand, code: "ABC-123")],
                recents: recents)
            await current.start()
            current.didScan("ABC-123")
            await current.pendingLookup?.value
        }

        #expect(scanned(in: recents) == ["item-1", "older"])
    }

    @Test("handled item links record while handled location links do not")
    func handledReferences() async {
        let recents = freshDefaults()
        let router = EntityRouterRegistry()
        router.register(pillar: "inventory", type: "item") { _ in }
        router.register(pillar: "inventory", type: "location") { _ in }

        let item = model(router: router, recents: recents)
        await item.start()
        item.didScan("pops://inventory/item/item-42")
        let location = model(router: router, recents: recents)
        await location.start()
        location.didScan("pops://inventory/location/loc-1")

        #expect(scanned(in: recents) == ["item-42"])
    }

    @Test("malformed and unsupported values do not record")
    func rejectedValues() async {
        let recents = freshDefaults()
        let malformed = model(recents: recents)
        await malformed.start()
        malformed.didScan("pops://inventory/item")
        let unsupported = model(recents: recents)
        await unsupported.start()
        unsupported.didScan("pops://finance/transaction/tx-1")

        #expect(scanned(in: recents).isEmpty)
    }

    @Test("seven distinct found scans keep the newest six")
    func scanLimit() async {
        let recents = freshDefaults()

        for index in 1...7 {
            let id = "item-\(index)"
            let code = "CODE-\(index)"
            let current = model(
                items: [InventoryFixture.item(id, id, at: .hand, code: code)],
                recents: recents)
            await current.start()
            current.didScan(code)
            await current.pendingLookup?.value
        }

        #expect(
            scanned(in: recents) == ["item-7", "item-6", "item-5", "item-4", "item-3", "item-2"])
    }

    private func model(
        items: [InventoryItem] = [],
        router: EntityRouterRegistry = EntityRouterRegistry(),
        recents: UserDefaults
    ) -> InventoryScanViewModel {
        InventoryScanViewModel(
            store: InMemoryInventoryStore(items: items), router: router,
            camera: StubCameraAuthorization(standing: .authorized), recents: recents)
    }

    private func freshDefaults() -> UserDefaults {
        guard let defaults = UserDefaults(suiteName: "InventoryScanRecentsTests.\(UUID())") else {
            preconditionFailure("Unable to create isolated defaults")
        }
        return defaults
    }

    private func scanned(in defaults: UserDefaults) -> [String] {
        InventorySearchRecents.decode(
            defaults.string(forKey: InventorySearchRecents.scannedKey) ?? "")
    }
}
