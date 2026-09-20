import AppCore
import Foundation
import GRDB
import Testing

@testable import InventoryReplica

@Suite("Type arrivals in the replica")
internal struct ReplicaTypeArrivalTests {
    private static let box = InventoryType(
        key: "storage_box", name: "Storage box", capabilities: [.containment], fields: [],
        legacyLabels: ["Box"])
    private static let bag = InventoryType(
        key: "bag", name: "Bag", capabilities: [], fields: [], legacyLabels: ["Bag"])
    private static let first = InventoryCatalogue(version: "cat-1", units: [], types: [box])
    private static let second = InventoryCatalogue(version: "cat-2", units: [], types: [box, bag])

    private static func untyped(_ id: String, legacy: String?) -> InventoryItem {
        InventoryItem(
            id: id, revision: 1, seq: 1, name: id, typeKey: nil, legacyType: legacy,
            placement: .hand, createdAt: Fixture.created, updatedAt: Fixture.created)
    }

    private static func temporaryDirectory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(
            "ReplicaTypeArrivalTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private static func onDisk(_ directory: URL) throws -> InventoryReplica {
        try InventoryReplica(onDiskAt: directory, freeBytes: { _ in 1 << 40 })
    }

    @Test("an item's legacy type is stored from the snapshot and survives a local change")
    func legacyTypeRoundTrips() throws {
        let replica = try Fixture.downloaded(items: [Self.untyped("canvas", legacy: "Bag")])
        #expect(try replica.read(.item(id: "canvas"))?.legacyType == "Bag")

        _ = try replica.perform(
            .editItem(id: "canvas", name: "Canvas bag", note: .unchanged, fields: [:]),
            mutationId: "m1", clientTime: Fixture.created)

        let edited = try replica.read(.item(id: "canvas"))
        #expect(edited?.name == "Canvas bag")
        #expect(edited?.legacyType == "Bag")
    }

    @Test("a split-off item does not inherit the legacy type, as the server's does not")
    func splitDropsTheLegacyType() throws {
        var item = Self.untyped("screws", legacy: "Hardware")
        item = InventoryItem(
            id: item.id, revision: 1, seq: 1, name: item.name, typeKey: nil,
            legacyType: item.legacyType, quantity: InventoryQuantity(count: 5), placement: .hand,
            createdAt: Fixture.created, updatedAt: Fixture.created)
        let replica = try Fixture.downloaded(items: [item])
        let newId = "6f1c1a8e-8a5f-4c1e-9a55-0d0b8f6c3a10"

        _ = try replica.perform(
            .splitItem(id: "screws", newItemId: newId, quantity: 2), mutationId: "m1",
            clientTime: Fixture.created)

        #expect(try replica.read(.item(id: "screws"))?.legacyType == "Hardware")
        #expect(try replica.read(.item(id: newId))?.legacyType == nil)
    }

    @Test("the first catalogue stored queues nothing")
    func firstCatalogueQueuesNothing() throws {
        let replica = try Fixture.downloaded(items: [Self.untyped("canvas", legacy: "Bag")])
        try replica.store(Self.second)
        #expect(try replica.read(.typeArrival) == nil)
    }

    @Test("a new catalogue version that adds a covering type offers it, once")
    func addedTypeIsOfferedOnce() throws {
        let replica = try Fixture.downloaded(items: [
            Self.untyped("canvas", legacy: "Bag"), Self.untyped("crate", legacy: "Box"),
        ])
        try replica.store(Self.first)
        try replica.store(Self.second)

        let arrival = try #require(try replica.read(.typeArrival))
        #expect(arrival.type.key == "bag")
        #expect(arrival.items.map(\.id) == ["canvas"])

        try replica.settleTypeArrival(typeKey: "bag")
        #expect(try replica.read(.typeArrival) == nil)
        try replica.store(InventoryCatalogue(version: "cat-3", units: [], types: [Self.box]))
        try replica.store(
            InventoryCatalogue(version: "cat-4", units: [], types: [Self.box, Self.bag]))
        #expect(try replica.read(.typeArrival) == nil)
    }

    @Test("a refresh that fetches a newer catalogue queues what it adds, and the store settles it")
    func refreshQueuesAndStoreSettles() async throws {
        let replica = try InventoryReplica(now: { Fixture.created })
        var script = FakeSyncTransport.Script()
        script.snapshot = { _ in Fixture.snapshot(items: [Self.untyped("canvas", legacy: "Bag")]) }
        script.changes = { _, _ in Fixture.changes() }
        script.catalogue = Self.first
        let transport = FakeSyncTransport(script)
        let store = LocalFirstInventoryStore(replica: replica, transport: transport)
        try await store.download()
        #expect(try replica.read(.typeArrival) == nil)

        transport.update { script in
            script.catalogue = Self.second
            script.changes = { _, _ in
                InventoryChangesPage(
                    epoch: Fixture.epoch, items: [], locations: [], events: [], nextSince: 20,
                    hasMore: false, catalogueVersion: "cat-2")
            }
        }
        await store.refresh()
        #expect(try replica.read(.typeArrival)?.items.map(\.id) == ["canvas"])

        try await store.settleTypeArrival(typeKey: "bag")
        #expect(try replica.read(.typeArrival) == nil)
    }

    @Test("a settled arrival stays settled after the replica is reopened")
    func settledSurvivesRelaunch() throws {
        let directory = try Self.temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        do {
            let replica = try Self.onDisk(directory)
            try replica.apply(Fixture.snapshot(items: [Self.untyped("canvas", legacy: "Bag")]))
            try replica.store(Self.first)
            try replica.store(Self.second)
            #expect(try replica.read(.typeArrival) != nil)
        }
        do {
            let reopened = try Self.onDisk(directory)
            #expect(try reopened.read(.typeArrival)?.type.key == "bag")
            try reopened.settleTypeArrival(typeKey: "bag")
        }
        let relaunched = try Self.onDisk(directory)
        #expect(try relaunched.read(.typeArrival) == nil)
        #expect(try relaunched.read(.item(id: "canvas"))?.legacyType == "Bag")
    }

    @Test("a resync keeps both the waiting and the settled arrivals")
    func resyncKeepsArrivals() throws {
        let tray = InventoryType(
            key: "tray", name: "Tray", capabilities: [], fields: [], legacyLabels: ["Tray"])
        let replica = try Fixture.downloaded(items: [
            Self.untyped("canvas", legacy: "Bag"), Self.untyped("desk", legacy: "Tray"),
        ])
        try replica.store(Self.first)
        try replica.store(
            InventoryCatalogue(version: "cat-2", units: [], types: [Self.box, Self.bag, tray]))
        try replica.settleTypeArrival(typeKey: "bag")

        try replica.resetForResync()
        try replica.apply(
            Fixture.snapshot(items: [
                Self.untyped("canvas", legacy: "Bag"), Self.untyped("desk", legacy: "Tray"),
            ]))

        #expect(try replica.read(.typeArrival)?.type.key == "tray")
    }

    @Test("upgrading a downloaded replica keeps its rows and makes the next feed request resync")
    func migrationForcesAResync() throws {
        let queue = try Self.databaseAtV5 { db in
            try db.execute(sql: "UPDATE sync_meta SET epoch = 'epoch-1', since = 10 WHERE id = 1")
            try Self.insertV5Item("kept", in: db)
        }

        try ReplicaSchema.migrator().migrate(queue)

        try queue.read { db in
            let meta = try SyncMeta.read(db)
            #expect(meta.epoch == ReplicaSchema.legacyTypeResyncEpoch)
            #expect(meta.since == 10)
            #expect(meta.typeArrivals == StoredTypeArrivals())
            let legacy = try String?.fetchOne(
                db, sql: "SELECT legacy_type FROM item_base WHERE id = 'kept'")
            #expect(legacy == .some(nil))
            #expect(try Int.fetchOne(db, sql: "SELECT count(*) FROM item") == 1)
        }
    }

    @Test("upgrading a replica part way through its first download starts that download over")
    func migrationRestartsAnInterruptedDownload() throws {
        let queue = try Self.databaseAtV5 { db in
            try db.execute(
                sql: """
                    UPDATE sync_meta SET epoch = 'epoch-1', snapshot_cursor = 'page-2',
                        snapshot_total = 4, snapshot_rows = 1 WHERE id = 1
                    """)
            try Self.insertV5Item("half", in: db)
        }

        try ReplicaSchema.migrator().migrate(queue)

        try queue.read { db in
            let meta = try SyncMeta.read(db)
            #expect(meta.epoch == nil)
            #expect(meta.snapshotCursor == nil)
            #expect(meta.snapshotRows == 0)
            #expect(try Int.fetchOne(db, sql: "SELECT count(*) FROM item_base") == 0)
            #expect(try Int.fetchOne(db, sql: "SELECT count(*) FROM item") == 0)
        }
    }

    @Test("upgrading a replica that never downloaded leaves it empty")
    func migrationLeavesAnEmptyReplicaAlone() throws {
        let queue = try Self.databaseAtV5 { _ in }
        try ReplicaSchema.migrator().migrate(queue)
        try queue.read { db in
            let meta = try SyncMeta.read(db)
            #expect(meta.epoch == nil)
            #expect(meta.since == nil)
        }
    }

    private static func databaseAtV5(_ seed: (Database) throws -> Void) throws -> DatabaseQueue {
        let queue = try DatabaseQueue()
        try ReplicaSchema.migrator().migrate(queue, upTo: "v5_media")
        try queue.write(seed)
        return queue
    }

    private static func insertV5Item(_ id: String, in db: Database) throws {
        for table in ReplicaSchema.itemLayers {
            try db.execute(
                sql: """
                    INSERT INTO \(table) (id, revision, seq, name, fields, external_ids, quantity,
                        lifecycle, placement_kind, is_container, photos, documents_status,
                        documents_linked, document_titles, created_at, updated_at)
                    VALUES (?, 1, 1, ?, '{}', '[]', 1, 'active', 'hand', 0, '[]', 'none', '[]',
                        '[]', 0, 0)
                    """, arguments: [id, id])
        }
    }
}
