import AppCore
import AppCoreFakes
import Testing

@testable import FeatureInventory

/// Store here by scanning: a code resolves to an item and that item is moved
/// into the target, repeatedly, with one Undo for the lot.
@MainActor
@Suite("Store here by scanning")
internal struct InventoryStoreScanModelTests {
    private typealias Fixture = InventoryFixture

    private static func rig(
        _ items: [InventoryItem], target: InventoryStoreTarget = InventoryStoreScanRig.box,
        camera: StubCameraAuthorization = StubCameraAuthorization(standing: .authorized)
    ) -> InventoryStoreScanRig {
        InventoryStoreScanRig(items, target: target, camera: camera)
    }

    private static func barcode(_ value: String) -> [InventoryExternalIdentifier] {
        [InventoryExternalIdentifier(kind: "barcode", value: value)]
    }

    private static func storing(_ id: String) -> InventoryCommand {
        .moveItem(id: id, to: .container("box"), verb: .store)
    }

    private static func answer(_ phase: InventoryStoreScanPhase)
        -> (id: String, outcome: InventoryStoreScanOutcome)?
    {
        guard case .answered(let record, let outcome) = phase else { return nil }
        return (record.id, outcome)
    }

    @Test("an item's own code stores it in the target with the store verb")
    func ownCodeStores() async {
        let rig = Self.rig([Fixture.item("drill", "Drill", at: .hand, code: "ABC-123")])

        await rig.scan("ABC-123")

        #expect(rig.store.commands == [Self.storing("drill")])
        #expect(Self.answer(rig.model.phase)?.id == "drill")
        #expect(Self.answer(rig.model.phase)?.outcome == .stored)
        #expect(rig.model.storedCount == 1)
    }

    @Test("a pops item reference and a barcode one item carries both store that item")
    func referenceAndBarcodeStore() async {
        let rig = Self.rig([
            Fixture.item("drill", "Drill", at: .hand),
            Fixture.item("kettle", "Kettle", at: .hand, externalIds: Self.barcode("5012345678900")),
        ])

        await rig.scan("pops://inventory/item/drill")
        await rig.scan("5012345678900")

        #expect(rig.store.commands == [Self.storing("drill"), Self.storing("kettle")])
        #expect(Self.answer(rig.model.phase)?.id == "kettle")
        #expect(rig.model.storedCount == 2)
    }

    @Test("a code still in view is acted on once, and again only after it has left view")
    func repeatedSightingsAreIgnored() async {
        let rig = Self.rig([Fixture.item("drill", "Drill", at: .hand, code: "ABC-123")])

        await rig.scan("ABC-123")
        for _ in 0..<5 {
            rig.clock.advance(InventoryStoreScanModel.repeatWindow / 2)
            await rig.scan("ABC-123")
        }

        #expect(rig.store.commands.count == 1)
        #expect(Self.answer(rig.model.phase)?.outcome == .stored)

        rig.clock.advance(InventoryStoreScanModel.repeatWindow)
        await rig.scan("ABC-123")

        #expect(rig.store.commands.count == 1)
        #expect(Self.answer(rig.model.phase)?.outcome == .alreadyHere)
    }

    @Test("two codes in view together are each stored once")
    func alternatingCodesStoreOnceEach() async {
        let rig = Self.rig([
            Fixture.item("drill", "Drill", at: .hand, code: "AAA"),
            Fixture.item("saw", "Saw", at: .hand, code: "BBB"),
        ])

        for _ in 0..<3 {
            await rig.scan("AAA")
            await rig.scan("BBB")
        }

        #expect(rig.store.commands == [Self.storing("drill"), Self.storing("saw")])
        #expect(Self.answer(rig.model.phase)?.id == "saw")
        #expect(Self.answer(rig.model.phase)?.outcome == .stored)
    }

    @Test("an item already in the target is answered without a move")
    func alreadyHereDoesNotMove() async {
        let rig = Self.rig([Fixture.item("drill", "Drill", at: .container("box"), code: "ABC")])

        await rig.scan("ABC")

        #expect(rig.store.commands.isEmpty)
        #expect(Self.answer(rig.model.phase)?.outcome == .alreadyHere)
    }

    @Test("the target, a container it sits inside, and an inactive item are all refused")
    func refusals() async {
        let crate = Fixture.item("crate", "Crate", at: .hand, access: .open, code: "CRATE")
        let nested = InventoryStoreTarget.container(id: "inner", name: "Inner")
        let rig = Self.rig(
            [
                crate,
                Fixture.item("inner", "Inner", at: .container("crate"), access: .open, code: "IN"),
                Fixture.item("vase", "Vase", at: .hand, lifecycle: .destroyed, code: "VASE"),
            ], target: nested)

        for code in ["IN", "CRATE", "VASE"] {
            await rig.scan(code)
            #expect(Self.answer(rig.model.phase)?.outcome == .refused, "\(code)")
        }
        #expect(rig.store.commands.isEmpty)
    }

    @Test("a barcode several storable items carry lists them, and the picked one is stored")
    func sharedBarcodeIsPicked() async {
        let rig = Self.rig([
            Fixture.item("mug-2", "Mug two", at: .hand, externalIds: Self.barcode("501")),
            Fixture.item("mug-1", "Mug one", at: .hand, externalIds: Self.barcode("501")),
        ])

        await rig.scan("501")

        guard case .matches(let records) = rig.model.phase else {
            Issue.record("expected .matches, got \(rig.model.phase)")
            return
        }
        #expect(records.map(\.id) == ["mug-1", "mug-2"])
        #expect(rig.store.commands.isEmpty)

        rig.model.pick(records[1])
        await rig.model.pending?.value

        #expect(rig.store.commands == [Self.storing("mug-2")])
        #expect(Self.answer(rig.model.phase)?.id == "mug-2")
    }

    @Test("a shared barcode with one copy left outside the target stores that copy")
    func lastCopyStoresWithoutAsking() async {
        let rig = Self.rig([
            Fixture.item(
                "mug-1", "Mug one", at: .container("box"), externalIds: Self.barcode("501")),
            Fixture.item("mug-2", "Mug two", at: .hand, externalIds: Self.barcode("501")),
        ])

        await rig.scan("501")

        #expect(rig.store.commands == [Self.storing("mug-2")])
    }

    @Test("codes with no item behind them are answered and move nothing")
    func unresolvedCodes() async {
        let rig = Self.rig([])
        let expected: [(String, InventoryStoreScanPhase)] = [
            ("NOPE", .notFound),
            ("pops://inventory/item/gone", .notFound),
            ("pops://inventory/location/garage", .notAnItem),
            ("pops://finance/transaction/1", .notAnItem),
            ("pops://broken", .notPops),
        ]

        for (payload, phase) in expected {
            await rig.scan(payload)
            #expect(rig.model.phase == phase, "\(payload)")
        }
        #expect(rig.store.commands.isEmpty)
    }

    @Test("a move the store refuses is a failure, counts nothing and offers no Undo")
    func failedMove() async {
        let rig = Self.rig([Fixture.item("drill", "Drill", at: .hand, code: "ABC")])
        rig.base.setStorageFull()

        await rig.scan("ABC")
        rig.model.finish()

        #expect(rig.model.phase == .failed)
        #expect(rig.model.storedCount == 0)
        #expect(rig.runner.undoOffer == nil)
    }

    @Test("closing offers one Undo that reverses every scanned move")
    func finishOffersOneUndo() async throws {
        let rig = Self.rig([
            Fixture.item("drill", "Drill", at: .hand, code: "AAA"),
            Fixture.item("saw", "Saw", at: .hand, code: "BBB"),
        ])
        #expect(rig.runner.undoOffer == nil)

        await rig.scan("AAA")
        await rig.scan("BBB")
        #expect(rig.runner.undoOffer == nil)
        rig.model.finish()

        let offer = try #require(rig.runner.undoOffer)
        #expect(offer.message == "Stored 2 in Box")
        await rig.runner.undo(offer)
        #expect(rig.store.undone.count == 2)
    }

    @Test("a refused camera scans nothing until access is granted in Settings")
    func deniedCamera() async {
        let camera = StubCameraAuthorization(standing: .denied)
        let rig = Self.rig(
            [Fixture.item("drill", "Drill", at: .hand, code: "ABC")], camera: camera)

        await rig.model.start()
        await rig.scan("ABC")

        #expect(rig.model.phase == .denied)
        #expect(rig.store.commands.isEmpty)

        camera.standing = .authorized
        rig.model.refreshCameraAccess()
        await rig.scan("ABC")

        #expect(rig.store.commands == [Self.storing("drill")])
    }
}
