import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureInventory

/// Every approved scan state (POPS-4078), and which of the two lookups
/// (`EntityRouter` for a `pops://` reference, `item(withCode:)` for a plain
/// code) resolves each kind of decode (POPS-4108).
@MainActor
@Suite("Inventory scan view model")
internal struct InventoryScanViewModelTests {
    private func model(
        items: [InventoryItem] = [],
        camera: StubCameraAuthorization = StubCameraAuthorization(
            standing: .authorized),
        router: EntityRouterRegistry = EntityRouterRegistry()
    ) -> InventoryScanViewModel {
        InventoryScanViewModel(
            store: InMemoryInventoryStore(items: items), router: router, camera: camera)
    }

    @Test("starting with camera access opens the scanner")
    func startedAuthorizedScans() async {
        let model = model(camera: StubCameraAuthorization(standing: .authorized))

        await model.start()

        #expect(model.phase == .scanning)
    }

    @Test(
        "a refusal shows the denied screen instead of a camera preview",
        arguments: [CameraAccess.denied, .restricted, .unavailable])
    func startedRefusedIsDenied(refusal: CameraAccess) async {
        let model = model(
            camera: StubCameraAuthorization(standing: .notDetermined, afterPrompt: refusal))

        await model.start()

        #expect(model.phase == .denied)
        #expect(model.cameraAccess == refusal)
    }

    @Test("a decision granted in Settings is picked up without relaunching")
    func refreshPicksUpAGrantMadeElsewhere() async {
        let camera = StubCameraAuthorization(standing: .denied)
        let model = model(camera: camera)
        await model.start()
        #expect(model.phase == .denied)

        camera.standing = .authorized
        model.refreshCameraAccess()

        #expect(model.phase == .scanning)
    }

    @Test("an item reference routes through the entity router and dismisses the screen")
    func itemReferenceRoutes() async {
        let router = EntityRouterRegistry()
        var routed: PopsURI?
        router.register(pillar: "inventory", type: "item") { routed = $0 }
        let model = model(router: router)
        await model.start()

        let consumed = model.didScan("pops://inventory/item/item-42")

        #expect(consumed)
        #expect(routed == PopsURI(pillar: "inventory", type: "item", id: "item-42"))
        #expect(model.didRouteElsewhere)
        #expect(model.phase == .scanning)
    }

    @Test("a location reference routes through the same entity router")
    func locationReferenceRoutes() async {
        let router = EntityRouterRegistry()
        var routed: PopsURI?
        router.register(pillar: "inventory", type: "location") { routed = $0 }
        let model = model(router: router)
        await model.start()

        model.didScan("pops://inventory/location/loc-1")

        #expect(routed == PopsURI(pillar: "inventory", type: "location", id: "loc-1"))
        #expect(model.didRouteElsewhere)
    }

    @Test("a reference to a pillar with nothing registered is a hand-off, not a routed destination")
    func foreignPillarIsUnsupported() async {
        let model = model()
        await model.start()

        let consumed = model.didScan("pops://finance/transaction/tx-1")

        #expect(consumed)
        #expect(model.phase == .unsupported(pillar: "finance"))
        #expect(!model.didRouteElsewhere)
    }

    @Test("a string that looks like a broken pops link is not treated as a code")
    func brokenPopsLinkIsNotACode() async {
        let model = model()
        await model.start()

        let consumed = model.didScan("pops://inventory/item")

        #expect(consumed)
        #expect(model.phase == .notPops)
    }

    @Test("a plain code that matches an item is found")
    func plainCodeFound() async {
        let model = model(items: [
            InventoryFixture.item("item-1", "Drill", at: .hand, code: "ABC-123")
        ])
        await model.start()

        model.didScan("ABC-123")
        await awaitObservedCondition { model.phase != .loading }

        guard case .found(let record) = model.phase else {
            Issue.record("expected .found, got \(model.phase)")
            return
        }
        #expect(record.id == "item-1")
    }

    @Test("the code lookup is case-insensitive, as the pillar's own index is")
    func plainCodeIsCaseInsensitive() async {
        let model = model(items: [
            InventoryFixture.item("item-1", "Drill", at: .hand, code: "ABC-123")
        ])
        await model.start()

        model.didScan("abc-123")
        await awaitObservedCondition { model.phase != .loading }

        #expect(
            model.phase == .found(InventoryRecordFixture.record("item-1", "Drill", code: "ABC-123"))
        )
    }

    @Test("a code nothing carries is target missing")
    func unknownCodeIsTargetMissing() async {
        let model = model(items: [
            InventoryFixture.item("item-1", "Drill", at: .hand, code: "ABC-123")
        ])
        await model.start()

        model.didScan("ZZZ-999")
        await awaitObservedCondition { model.phase != .loading }

        #expect(model.phase == .targetMissing)
    }

    /// POPS-4108's deleted-item rule: the code stays reserved, but scanning it
    /// answers the same as an id this replica has never held.
    @Test("a tombstoned holder's code is target missing, not found")
    func tombstonedCodeIsTargetMissing() async {
        let model = model(
            items: [
                InventoryFixture.item(
                    "item-1", "Drill", at: .hand, code: "ABC-123", deleted: true)
            ])
        await model.start()

        model.didScan("ABC-123")
        await awaitObservedCondition { model.phase != .loading }

        #expect(model.phase == .targetMissing)
    }

    @Test("scanning again while a card is already up does nothing until it clears")
    func doesNotConsumeWhileNotScanning() async {
        let router = EntityRouterRegistry()
        var invocationCount = 0
        router.register(pillar: "inventory", type: "item") { _ in invocationCount += 1 }
        let model = model(router: router)
        await model.start()
        model.didScan("pops://finance/transaction/tx-1")
        #expect(model.phase == .unsupported(pillar: "finance"))

        let consumed = model.didScan("pops://inventory/item/item-1")

        #expect(!consumed)
        #expect(invocationCount == 0)
        #expect(model.phase == .unsupported(pillar: "finance"))
    }
}

/// Builds the exact `InventoryRecord` `InventoryRecordReader` would, for a
/// test that wants to compare a found phase's payload rather than only its
/// case.
private enum InventoryRecordFixture {
    static func record(_ id: String, _ name: String, code: String?) -> InventoryRecord {
        InventoryRecord(
            id: id, name: name, typeKey: nil, typeName: nil, code: code,
            quantity: InventoryQuantity(count: 1), lifecycle: .active, access: nil,
            placement: .hand, path: [], sync: .synchronized, photo: nil,
            createdAt: InventoryFixture.epoch)
    }
}
