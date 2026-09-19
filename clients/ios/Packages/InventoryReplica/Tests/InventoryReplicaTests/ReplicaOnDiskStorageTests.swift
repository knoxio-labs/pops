import AppCore
import Foundation
import GRDB
import Testing

@testable import InventoryReplica

/// The failure this build's own schema does not have yet, standing in for
/// a real one -- corruption, a downgrade, a future migration this binary
/// does not know -- so the fallback path can be exercised without waiting
/// for a real defect.
private struct StandInMigrationFailure: Error {}

@Suite("The on-disk replica's durability floor")
internal struct ReplicaOnDiskStorageTests {
    @Test("opening on disk under 200 MB free raises storage full before touching the database")
    func belowFreeSpaceFloorRaisesStorageFull() throws {
        let directory = try Self.temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }

        #expect(throws: InventoryStorageError.full) {
            _ = try InventoryReplica(onDiskAt: directory, freeBytes: { _ in 100 * 1024 * 1024 })
        }
        let databasePath = directory.appendingPathComponent("inventory.sqlite").path
        #expect(
            !FileManager.default.fileExists(atPath: databasePath),
            "a storage-full replica must not have opened the database at all")
    }

    @Test("opening on disk at or above 200 MB free does not raise storage full")
    func atFreeSpaceFloorSucceeds() throws {
        let directory = try Self.temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }

        _ = try InventoryReplica(onDiskAt: directory, freeBytes: { _ in 200 * 1024 * 1024 })
    }

    @Test("a failing migration re-snapshots the database and keeps the queued mutation-log rows")
    func failingMigrationResnapshotsAndKeepsQueuedRows() throws {
        let directory = try Self.temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let path = directory.appendingPathComponent("replica.sqlite").path

        let initial = Self.standInMigrator()
        do {
            let queue = try ReplicaSchema.openOnDisk(at: path, migrator: initial)
            try queue.write { db in
                try db.execute(
                    sql: "INSERT INTO mutation_log (id, payload) VALUES (?, ?)",
                    arguments: ["m1", "queued-1"])
                try db.execute(
                    sql: "INSERT INTO mutation_log (id, payload) VALUES (?, ?)",
                    arguments: ["m2", "queued-2"])
                // Stands in for whatever a real broken migration would find
                // wrong with the file: a later migration below refuses to
                // run while this is present.
                try db.execute(sql: "CREATE TABLE poison (marker INTEGER NOT NULL)")
            }
        }

        var broken = Self.standInMigrator()
        broken.registerMigration("v2_needs_clean_state") { db in
            if try db.tableExists("poison") { throw StandInMigrationFailure() }
        }

        let reopened = try ReplicaSchema.openOnDisk(at: path, migrator: broken)

        let rows = try reopened.read { db in
            try Row.fetchAll(db, sql: "SELECT id, payload FROM mutation_log ORDER BY id")
        }
        #expect(rows.map { $0["id"] as String } == ["m1", "m2"])
        #expect(rows.map { $0["payload"] as String } == ["queued-1", "queued-2"])
        #expect(try !reopened.read { try $0.tableExists("poison") })
    }

    private static func standInMigrator() -> DatabaseMigrator {
        var migrator = DatabaseMigrator()
        migrator.registerMigration("v1_standin") { db in
            try db.execute(
                sql: """
                    CREATE TABLE mutation_log (
                        id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL
                    )
                    """)
        }
        return migrator
    }

    private static func temporaryDirectory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(
            "InventoryReplicaTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
}
