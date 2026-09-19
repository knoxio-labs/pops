import AppCore
import AppCoreFakes
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Inventory repair view model")
internal struct InventoryRepairViewModelTests {
    private typealias Fixture = InventoryFixture

    @Test("a repair that is not in the ledger reads as resolved elsewhere, not a hang")
    func missingRepairIsResolvedElsewhere() async {
        let store = InMemoryInventoryStore()
        let model = InventoryRepairViewModel(repairId: "missing", store: store)
        let task = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }

        #expect(model.phase == .resolvedElsewhere)
    }

    @Test("an open repair carries its row and offers the code field only for a collision")
    func openRepairCarriesRow() async throws {
        let store = InMemoryInventoryStore(
            items: [Fixture.item("box", "Moving box", at: .location("kitchen"))],
            locations: [Fixture.location("kitchen", "Kitchen")])
        let repair = Fixture.repair(
            "m1", on: "box", kind: .codeCollision, suggestedCode: "B413",
            heldByName: "Kitchen 09")
        store.addRepair(repair)
        let model = InventoryRepairViewModel(repairId: "m1", store: store)
        let task = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }

        let row = try #require(model.row)
        #expect(row.repair.kind == .codeCollision)
        #expect(row.repair.kind.keepTitle == "Save")
        #expect(row.problem.contains("Kitchen 09"))
    }

    @Test("keeping mine with a code resolves and names the code that was saved")
    func keepingMineWithCodeNamesIt() async throws {
        let store = InMemoryInventoryStore()
        let repair = Fixture.repair("m1", on: "box", kind: .codeCollision, suggestedCode: "B413")
        store.addRepair(repair)
        let model = InventoryRepairViewModel(repairId: "m1", store: store)
        let task = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }

        await model.commit(keepingMine: true, code: "B413")

        #expect(model.outcome == "Relabelled B413")
    }

    @Test("discarding mine says what letting go means for this repair's kind")
    func discardingMineNamesTheLetGoOutcome() async throws {
        let store = InMemoryInventoryStore()
        let repair = Fixture.repair("m1", on: "box", kind: .photoFailed)
        store.addRepair(repair)
        let model = InventoryRepairViewModel(repairId: "m1", store: store)
        let task = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }

        await model.commit(keepingMine: false, code: nil)

        #expect(model.outcome == "Photo removed")
    }

    @Test("a write the store refuses is reported, and no outcome is claimed")
    func refusedCommitIsReported() async throws {
        let repair = Fixture.repair("m1", on: "box", kind: .conflict, field: "name")
        let store = InMemoryInventoryStore(repairs: [repair])
        let model = InventoryRepairViewModel(repairId: "m1", store: store)
        let task = await model.startAndAwaitFirstAnswer()
        #expect(model.row != nil)
        // Stops the model's own observation so its `row` stays the stale
        // value below, rather than racing the ledger update the direct
        // `resolve` call below also triggers.
        task.cancel()

        // Resolved out from under the model between reading the row and
        // committing, which is what a real transport failure looks like to
        // this fake: `resolve` throws for a repair id it no longer holds.
        try await store.resolve("m1", with: .keepMine())
        await model.commit(keepingMine: true, code: nil)

        #expect(model.failure == .repository(.contractMismatch))
        #expect(model.outcome == nil)
    }

    @Test("a resolution the phone has no room for reports storage full, not a network fault")
    func storageFullCommitIsReported() async throws {
        let repair = Fixture.repair("m1", on: "box", kind: .conflict, field: "name")
        let store = RefusingResolveStore(
            InMemoryInventoryStore(repairs: [repair]), error: InventoryStorageError.full)
        let model = InventoryRepairViewModel(repairId: "m1", store: store)
        let task = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }
        #expect(model.row != nil)

        await model.commit(keepingMine: true, code: nil)

        #expect(model.failure == .storageFull)
        #expect(InventoryWriteFailureAlerts.storageFullFailure(model.failure) == .storageFull)
        #expect(model.outcome == nil)
    }

    @Test("an unrecognised repair kind offers only Let go")
    func unrecognisedOffersOnlyLetGo() {
        let kind = InventoryRepairKind.unrecognised("some_new_outcome")

        #expect(kind.keepTitle == nil)
        #expect(kind.letGoTitle == "Let go")
    }
}
