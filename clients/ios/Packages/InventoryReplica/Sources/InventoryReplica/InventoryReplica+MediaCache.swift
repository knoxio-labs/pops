import AppCore
import Foundation
import GRDB

/// The media cache (ADR-002 D11): every photo variant fetched from the
/// server is kept in the media store, so it is not fetched again, even after
/// a relaunch, until the budget evicts it.
extension InventoryReplica {
    /// A held copy of a photo variant, or nil when the phone has none. A
    /// photo this phone staged answers every variant with its own bytes
    /// until that variant is cached, because the server may not have it
    /// yet. A hit counts as a use for eviction. A row whose file has gone is
    /// forgotten, so the variant is fetched again.
    public func cachedPhoto(_ sha256: String, variant: InventoryPhotoVariant) throws -> Data? {
        let exact = MediaCacheRows.variantName(variant)
        let (held, staged) = try database.read { db in
            (
                try MediaCacheRows.heldVariants(of: sha256, in: db),
                try MediaCacheRows.isStaged(sha256, in: db)
            )
        }
        var candidates = [exact]
        if staged, exact != MediaRows.stagedVariant { candidates.append(MediaRows.stagedVariant) }
        for name in candidates where held.contains(name) {
            guard
                let data = try mediaFiles.read(
                    named: MediaRows.fileName(sha256: sha256, variant: name))
            else {
                try write { try MediaCacheRows.forget(sha256, variant: name, in: $0) }
                continue
            }
            let time = storedDate(now())
            try write { try MediaRows.touch(sha256, variant: name, at: time, in: $0) }
            return data
        }
        return nil
    }

    /// Keeps a variant fetched from the server, then evicts what no longer
    /// fits the budget.
    ///
    /// - Throws: ``AppCore/InventoryStorageError/full`` when the disk has no
    ///   room for it.
    public func cachePhoto(_ data: Data, sha256: String, variant: InventoryPhotoVariant) throws {
        let name = MediaCacheRows.variantName(variant)
        try ReplicaStorage.mappingFull {
            try mediaFiles.write(data, named: MediaRows.fileName(sha256: sha256, variant: name))
        }
        let time = storedDate(now())
        try write { db in
            try MediaCacheRows.recordCached(
                sha256: sha256, variant: name, bytes: data.count, at: time, in: db)
        }
        try evictOverBudget()
    }

    /// Evicts what the media cache holds beyond its budget, rows first, then
    /// their files.
    func evictOverBudget() throws {
        let evicted = try write { db in
            try MediaCacheBudget.evict(toFit: mediaBudgetBytes, in: db)
        }
        for name in evicted {
            try mediaFiles.remove(named: name)
        }
    }
}
