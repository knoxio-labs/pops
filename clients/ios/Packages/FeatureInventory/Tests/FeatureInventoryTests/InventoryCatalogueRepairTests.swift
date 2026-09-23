import AppCore
import AppCoreFakes
import Testing

@testable import FeatureInventory

/// The `catalogueChanged` repair (POPS-4405) on the Sync page, the repair
/// screen and the item it is about: a change a newer catalogue no longer
/// fits can be sent again against the current fields, or let go.
@MainActor
@Suite("Inventory catalogue repair")
internal struct InventoryCatalogueRepairTests {
    private typealias Fixture = InventoryFixture

    @Test("the Sync page lists it with its own problem line and Retry as the inline fix")
    func rowOnTheSyncPage() async throws {
        let inner = InMemoryInventoryStore(
            items: [Fixture.item("lamp", "Desk lamp", at: .location("kitchen"))],
            locations: [Fixture.location("kitchen", "Kitchen")])
        let repair = Fixture.repair("m1", on: "lamp", kind: .catalogueChanged)
        inner.addRepair(repair)
        let store = RecordingInventoryStore(inner)
        let model = InventorySyncViewModel(store: store)
        let (task, _) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }

        let page = await model.awaitPage { !$0.repairRows.isEmpty }
        let row = try #require(page?.repairRows.first)
        #expect(row.display.name == "Desk lamp")
        #expect(row.problem == "A field this change used was archived or replaced.")
        #expect(row.repair.kind.fix.title == "Retry")

        await model.resolveInline(repair)

        #expect(store.resolutions == [.keepMine()])
        #expect(model.undoOffer?.message == "Sent with current fields")
    }

    @Test("the repair screen offers Retry and Let go, and says what each did")
    func repairScreenCommits() async throws {
        let store = InMemoryInventoryStore()
        store.addRepair(Fixture.repair("m1", on: "lamp", kind: .catalogueChanged))
        let keeping = InventoryRepairViewModel(repairId: "m1", store: store)
        let task = await keeping.startAndAwaitFirstAnswer()
        defer { task.cancel() }

        let row = try #require(keeping.row)
        #expect(row.repair.kind.keepTitle == "Retry")
        #expect(row.repair.kind.letGoTitle == "Let go")
        await keeping.commit(keepingMine: true, code: nil)
        #expect(keeping.outcome == "Sent with current fields")

        store.addRepair(Fixture.repair("m2", on: "lamp", kind: .catalogueChanged))
        let lettingGo = InventoryRepairViewModel(repairId: "m2", store: store)
        let second = await lettingGo.startAndAwaitFirstAnswer()
        defer { second.cancel() }
        await lettingGo.commit(keepingMine: false, code: nil)
        #expect(lettingGo.outcome == "Let go")
    }

    @Test("a retry the catalogue still refuses is reported in words, and the repair stays open")
    func refusedRetryIsReported() async throws {
        let repair = Fixture.repair("m1", on: "lamp", kind: .catalogueChanged)
        let store = RefusingResolveStore(
            InMemoryInventoryStore(repairs: [repair]),
            error: InventoryCommandError.rejected(
                reason: .catalogueRepairRequired, message: "field lumens was archived"))
        let model = InventoryRepairViewModel(repairId: "m1", store: store)
        let task = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }

        await model.commit(keepingMine: true, code: nil)

        let failure = try #require(model.failure)
        #expect(model.outcome == nil)
        #expect(model.row?.repair.id == "m1")
        #expect(
            InventoryCopy.message(for: failure)
                == "A field this change used was archived or replaced, so nothing changed.")
    }

    @Test("the item's own notice names the replaced field and offers Retry")
    func itemNotice() {
        let repair = Fixture.repair("m1", on: "lamp", kind: .catalogueChanged)

        let conflict = InventoryDetailConflicts.conflict(repair)

        #expect(conflict.problem == "A field in a queued change was replaced")
        #expect(conflict.resolution == "Retry")
        #expect(conflict.choice == .keepMine())
    }

    @Test("an update-required refusal asks for a sync rather than blaming the server")
    func updateRequiredCopy() {
        let failure = InventoryWriteFailure.command(
            .rejected(reason: .catalogueUpdateRequired, message: "revision 2 is unavailable"))

        #expect(
            InventoryCopy.message(for: failure)
                == "The item's fields changed since this was opened. Sync, then try again.")
    }
}
