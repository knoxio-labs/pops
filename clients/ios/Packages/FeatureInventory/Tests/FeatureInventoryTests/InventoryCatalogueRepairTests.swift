import AppCore
import AppCoreFakes
import Testing

@testable import FeatureInventory

/// The `catalogueChanged` repair (POPS-4405, POPS-4494) on the Sync page, the
/// repair screen, the item it is about and the form Edit item opens, as the
/// owner approved it: one-tap entry points open the repair, Edit item leads
/// while something is in the way, and Retry shows only once the fields moved.
@MainActor
@Suite("Inventory catalogue repair")
internal struct InventoryCatalogueRepairTests {
    private typealias Fixture = CatalogueRepairFixture

    @Test("the Sync row names what happened and its icon opens the repair, never retrying")
    func syncRowOpensTheRepair() async throws {
        let store = Fixture.store()
        let model = InventorySyncViewModel(store: store)
        let (task, _) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }

        let page = await model.awaitPage { !$0.repairRows.isEmpty }
        let row = try #require(page?.repairRows.first)

        #expect(row.problem == "Shielding was archived")
        #expect(row.repair.kind.fix.title == "Review")
        #expect(row.repair.kind.opensRepair)
        #expect(InventoryRepairKind.photoFailed.opensRepair == false)
        #expect(store.resolutions.isEmpty)
    }

    @Test("a held change says why on its row, and the header says Updating fields")
    func heldRowsAndHeader() async throws {
        let waiting = [
            Self.waiting("m2", hold: .waitingForFields),
            Self.waiting("m3", hold: .needsAppUpdate),
            Self.waiting("m4", hold: .behindRepair),
        ]
        let model = InventorySyncViewModel(store: Fixture.store(repairs: [], waiting: waiting))
        let (task, _) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }

        let page = try #require(await model.awaitPage { $0.waitingRows.count == 3 })

        #expect(
            page.waitingRows.map(\.caption) == [
                "Edit · Waiting for new fields", "Edit · Needs an app update",
                "Edit · Waits on a repair",
            ])
        #expect(InventorySyncHeaderStatus.derive(page: page) == .updatingFields)
        #expect(InventorySyncView.statusLine(.updatingFields) == "Updating fields")
    }

    @Test("an unreadable change shows as stuck, and so does the header")
    func stalledRow() async throws {
        let stuck = InventoryQueuedMutation(
            receipt: InventoryReceipt(mutationId: "m9", entityKind: .item, entityId: "cable"),
            command: nil, enqueuedAt: InventoryFixture.epoch, hold: .stalled)
        let model = InventorySyncViewModel(
            store: Fixture.store(repairs: [], waiting: [stuck, Self.waiting("m2", hold: nil)]))
        let (task, _) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }

        let page = try #require(await model.awaitPage { $0.waitingRows.count == 2 })

        #expect(page.waitingRows.first?.caption == "Can't be read · Can't be sent")
        #expect(InventorySyncHeaderStatus.derive(page: page) == .stuck(waiting: 2))
    }

    @Test("Retry the catalogue still refuses says what is in the way; the repair stays open")
    func refusedRetry() async throws {
        let store = Fixture.store(
            repairs: [
                Fixture.repair(
                    queued: Fixture.shieldingArchived.catalogue?.queued,
                    changes: Fixture.shieldingArchived.catalogue?.changes ?? [], current: 3)
            ],
            catalogue: Fixture.catalogue(revision: 3))
        store.failResolves(
            with: InventoryCommandError.rejected(reason: .catalogueRepairRequired, message: "x"))
        let model = InventoryRepairViewModel(repairId: "m1", store: store)
        let task = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }
        #expect(model.row?.catalogue?.offersRetry == true)

        await model.commit(keepingMine: true, code: nil)

        #expect(store.resolutions == [.keepMine()])
        #expect(model.refusal == "Shielding is still archived, so nothing was sent.")
        #expect(model.failure == nil)
        #expect(model.outcome == nil)
        #expect(model.row?.repair.id == "m1")
    }

    @Test("Let go settles it")
    func letGo() async throws {
        let store = Fixture.store()
        let model = InventoryRepairViewModel(repairId: "m1", store: store)
        let task = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }

        await model.commit(keepingMine: false, code: nil)

        #expect(store.resolutions == [.discardMine])
        #expect(model.outcome == "Let go")
    }

    @Test("the item's notice names the queued change and opens the repair instead of retrying")
    func itemNotice() async throws {
        let detail = Fixture.reading().detail(Fixture.shieldingArchived)

        let conflict = InventoryDetailConflicts.conflict(
            Fixture.shieldingArchived, catalogue: detail)

        #expect(conflict.problem == "Queued edit: Shielding was archived")
        #expect(conflict.resolution == "Review")
        #expect(conflict.opensRepair)

        let store = Fixture.store()
        let model = InventoryItemDetailViewModel(itemId: Fixture.cableId, store: store)
        let (task, loaded) = await model.startAndAwaitDetail()
        defer { task.cancel() }
        #expect(loaded?.conflict?.opensRepair == true)
        await model.resolveConflict()
        #expect(store.resolutions.isEmpty)
    }

    private static func waiting(_ id: String, hold: InventoryQueueHold?) -> InventoryQueuedMutation
    {
        InventoryQueuedMutation(
            receipt: InventoryReceipt(mutationId: id, entityKind: .item, entityId: "cable"),
            command: Fixture.edit([(Fixture.length, .string("3 m"))]),
            enqueuedAt: InventoryFixture.epoch, hold: hold)
    }
}
