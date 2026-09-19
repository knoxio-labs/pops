import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureInventory

@Suite("Inventory dashboard mapping")
internal struct InventoryDashboardMappingTests {
    private typealias Fixture = InventoryFixture

    private static let repair = InventoryRepair(
        id: "r1", entityKind: .item, entityId: "router", kind: .conflict, field: "name",
        openedAt: Fixture.epoch)

    private static func waiting(_ entityId: String, progress: Double?) -> InventoryQueuedMutation {
        InventoryQueuedMutation(
            receipt: InventoryReceipt(
                mutationId: "m-\(entityId)", entityKind: .item, entityId: entityId),
            command: .setItemFull(id: entityId, isFull: true), enqueuedAt: Fixture.epoch,
            progress: progress)
    }

    @Test(
        "the sync pill puts repairs first, then a download, then being cut off, then sending",
        arguments: [
            (
                InventoryReplicaStatus.offline(lastRefreshAt: nil), true,
                InventoryDashboardSync.needsAttention(count: 1)
            ),
            (.downloading(progress: 0.62), false, .synchronizing(progress: 0.62)),
            (.offline(lastRefreshAt: Fixture.epoch), false, .offline(since: Fixture.epoch)),
            (.stale(lastRefreshAt: Fixture.epoch), false, .offline(since: Fixture.epoch)),
            (.blocked(reason: .appTooOld), false, .offline(since: nil)),
            (.current, false, .current),
            (.refreshing, false, .current),
        ])
    func syncPill(status: InventoryReplicaStatus, hasRepair: Bool, expected: InventoryDashboardSync)
    {
        let ledger = InventoryReplicaSyncLedger(repairs: hasRepair ? [Self.repair] : [])
        #expect(InventoryDashboardSync.derive(status: status, ledger: ledger) == expected)
    }

    @Test("a change in flight shows as syncing only while the replica is otherwise current")
    func inFlightIsSyncing() {
        let ledger = InventoryReplicaSyncLedger(waiting: [Self.waiting("box", progress: 0.4)])

        #expect(
            InventoryDashboardSync.derive(status: .current, ledger: ledger)
                == .synchronizing(progress: 0.4))
        #expect(
            InventoryDashboardSync.derive(status: .offline(lastRefreshAt: nil), ledger: ledger)
                == .offline(since: nil))
    }

    @Test("a row's sync comes from its own repairs and waiting changes, then the replica")
    func rowSync() {
        let ledger = InventoryReplicaSyncLedger(
            waiting: [
                Self.waiting("sending", progress: 0.1), Self.waiting("waiting", progress: nil),
            ],
            repairs: [Self.repair])
        let current = InventoryRowSync(status: .current, ledger: ledger)
        let stale = InventoryRowSync(status: .stale(lastRefreshAt: nil), ledger: ledger)

        #expect(current.sync(of: "router") == .needsAttention)
        #expect(current.sync(of: "sending") == .synchronizing)
        #expect(current.sync(of: "waiting") == .queued)
        #expect(current.sync(of: "other") == .synchronized)
        #expect(stale.sync(of: "other") == .stale)
    }

    @Test("the effective-location walk stops on a containment cycle instead of spinning")
    func walkStopsOnCycle() async throws {
        let store = InMemoryInventoryStore(items: [
            Fixture.item("a", "A", at: .container("b"), access: .open),
            Fixture.item("b", "B", at: .container("a"), access: .open),
        ])
        var values = store.observe(InventoryDashboard.query(recentLimit: 0)).makeAsyncIterator()
        let dashboard = try #require(await values.next())

        #expect(dashboard.openContainers.map(\.place) == [nil, nil])
    }

    @Test("verbs read the recorded value first, then the current state, then the wire word")
    func activityVerbs() {
        let closedBox = Fixture.item("box", "Box", at: .hand, access: .closed)
        let recordedOpen = Fixture.event(
            1, .accessChanged, on: "box", after: ["access": .text("open")])
        let unrecorded = Fixture.event(2, .accessChanged, on: "box")
        let discarded = Fixture.event(
            3, .lifecycleChanged, on: "box", after: ["lifecycle": .choice("discarded")])
        let emptied = Fixture.event(4, .fullnessChanged, on: "box", after: ["isFull": .flag(false)])
        let unknown = Fixture.event(5, .unrecognised("split_into"), on: "box")

        #expect(InventoryActivityLine.verb(for: recordedOpen, current: closedBox) == "opened")
        #expect(InventoryActivityLine.verb(for: unrecorded, current: closedBox) == "closed")
        #expect(InventoryActivityLine.verb(for: discarded, current: closedBox) == "discarded")
        #expect(InventoryActivityLine.verb(for: emptied, current: nil) == "no longer full")
        #expect(InventoryActivityLine.verb(for: unknown, current: nil) == "split into")
    }

    @Test("an in-hand row's second line names the place, or why there is none")
    func fromLine() {
        #expect(
            InventoryInHandRowLabel.fromLine(.place(name: "Office 04", placement: .location("o")))
                == "From Office 04")
        #expect(InventoryInHandRowLabel.fromLine(.deleted) == "Previous place deleted")
        #expect(InventoryInHandRowLabel.fromLine(.nowhere) == "Nowhere recorded")
    }

    @Test("a row detail leaves out a missing place, and never says something is in the future")
    func detailLine() {
        let now = Fixture.epoch
        let future = now.addingTimeInterval(120)

        #expect(
            InventoryCopy.detail(place: nil, at: future, now: now)
                == InventoryRelativeTime.text(now, now: now))
        #expect(InventoryCopy.detail(place: "Kitchen", at: now, now: now).hasPrefix("Kitchen · "))
    }
}
