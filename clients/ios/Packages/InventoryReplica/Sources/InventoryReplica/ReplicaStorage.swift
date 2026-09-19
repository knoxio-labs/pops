import AppCore
import Foundation
import GRDB

/// The two ways the on-disk replica can run out of room (ADR-002 D11): a
/// probe checked before a write starts, and SQLite's own refusal for one
/// that started anyway, both mapped onto the same `InventoryStorageError`.
internal enum ReplicaStorage {
    /// Below this, `ensureFreeSpace` raises the storage-full interruption
    /// rather than let the write reach SQLite (ADR-002's 200 MB line).
    internal static let minimumFreeBytes: Int64 = 200 * 1024 * 1024

    /// - Throws: ``AppCore/InventoryStorageError/full`` if `probe` answers
    ///   under `minimumFreeBytes`. Any other error `probe` throws propagates
    ///   unchanged, and a passing probe returns without side effects.
    internal static func ensureFreeSpace(_ probe: () throws -> Int64) throws {
        if try probe() < minimumFreeBytes {
            throw InventoryStorageError.full
        }
    }

    /// The free space on the volume backing `directory`, for the production
    /// probe; tests inject a fixed value instead so the 200 MB line is
    /// exercised without needing an actually-full disk.
    ///
    /// Asked of the nearest folder that exists, because the probe runs
    /// before `directory` is created (a first launch) and a missing path
    /// answers no volume at all; a folder and its ancestors share one.
    internal static func systemFreeBytes(at directory: URL) throws -> Int64 {
        var existing = directory.standardizedFileURL
        while !FileManager.default.fileExists(atPath: existing.path),
            existing.pathComponents.count > 1
        {
            existing.deleteLastPathComponent()
        }
        let values = try existing.resourceValues(forKeys: [
            .volumeAvailableCapacityForImportantUsageKey
        ])
        guard let capacity = values.volumeAvailableCapacityForImportantUsage else {
            throw FreeSpaceUnavailable()
        }
        return capacity
    }

    /// Runs `body`, turning SQLite's own `SQLITE_FULL` into the same
    /// interruption a pre-write probe would have raised, for a write that
    /// started anyway and only then found the disk full.
    internal static func mappingFull<Value>(_ body: () throws -> Value) throws -> Value {
        do {
            return try body()
        } catch let error as DatabaseError where error.resultCode == .SQLITE_FULL {
            throw InventoryStorageError.full
        }
    }
}

/// The volume backing the replica does not report a usable free-space
/// figure. Distinct from ``AppCore/InventoryStorageError/full``: this is "the
/// probe itself failed", not "the probe answered and the disk is full".
internal struct FreeSpaceUnavailable: Error {}
