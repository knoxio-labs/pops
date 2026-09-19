import AppCore
import CryptoKit
import Foundation
import GRDB

/// Photos staged on this phone (ADR-002 D9, D11): the bytes are written and
/// pinned before the change attaching them is logged, the drain uploads
/// them ahead of that change, and they stay pinned until the server has
/// them and no change in the log still attaches them.
extension InventoryReplica {
    /// Writes a photo's bytes to the media store and records them as
    /// waiting to upload, pinned. When this returns, an `item.attachPhoto`
    /// of the hash can be performed: the drain holds it until the bytes are
    /// on the server.
    ///
    /// - Returns: `alreadyStored` when the phone already held the bytes, on
    ///   their way to the server or on it.
    /// - Throws: ``AppCore/InventoryStorageError/full`` when less than
    ///   200 MB is free; ``AppCore/InventoryCommandError`` when the bytes do
    ///   not hash to `sha256`, which the server would refuse too.
    public func stagePhoto(
        sha256: String, data: Data, contentType: InventoryMediaContentType
    ) throws -> InventoryMediaUploadResult {
        let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        guard digest == sha256.lowercased() else {
            throw InventoryCommandError.rejected(
                reason: .invalid, message: "the photo's bytes do not match its hash")
        }
        if let freeBytes { try ReplicaStorage.ensureFreeSpace(freeBytes) }
        try ReplicaStorage.mappingFull {
            try mediaFiles.write(
                data, named: MediaRows.fileName(sha256: digest, variant: MediaRows.stagedVariant))
        }
        let time = storedDate(now())
        let held = try write { db in
            try MediaRows.stage(
                sha256: digest, contentType: contentType, bytes: data.count, at: time, in: db)
        }
        return InventoryMediaUploadResult(sha256: digest, alreadyStored: held)
    }

    /// The bytes this phone staged for a photo, or nil when it holds none.
    public func stagedPhoto(_ sha256: String) throws -> Data? {
        guard try database.read({ try MediaRows.holdsStaged(sha256, in: $0) }) else { return nil }
        return try mediaFiles.read(
            named: MediaRows.fileName(sha256: sha256, variant: MediaRows.stagedVariant))
    }

    /// Staged photos waiting to upload, oldest first. Before listing them,
    /// uploads a pass the app did not live to finish left in flight are
    /// returned to waiting, and every change attaching a photo that failed
    /// is refused on the phone, opening its failed photo repair.
    func uploadsToSend() throws -> [StagedUpload] {
        try write { db in
            try MediaRows.requeueUploading(in: db)
            try refuseAttachesOfFailedPhotos(in: db)
            return try MediaRows.waiting(in: db)
        }
    }

    func markUploading(_ sha256: String) throws {
        try write { try MediaRows.setState(.uploading, of: sha256, in: $0) }
    }

    /// The server has the bytes, `201` or `alreadyStored` alike.
    func markUploaded(_ sha256: String) throws {
        try write { try MediaRows.markUploaded(sha256, in: $0) }
    }

    /// The upload never arrived: send it again on the next pass.
    func returnUpload(_ sha256: String) throws {
        try write { try MediaRows.setState(.waiting, of: sha256, in: $0) }
    }

    /// The server refused the bytes, or they are gone from the phone:
    /// records why, and refuses every change waiting to attach them, which
    /// opens the failed photo repair for each.
    func failUpload(_ sha256: String, _ failure: InventoryPhotoUploadFailure) throws {
        try write { db in
            try MediaRows.setState(
                .failed, failure: StagedUploadFailure(failure), of: sha256, in: db)
            try refuseAttachesOfFailedPhotos(in: db)
        }
    }

    private func refuseAttachesOfFailedPhotos(in db: Database) throws {
        let failed = Dictionary(
            try MediaRows.failed(in: db), uniquingKeysWith: { first, _ in first })
        guard !failed.isEmpty else { return }
        let time = storedDate(now())
        var refused: Set<EntityRef> = []
        for var entry in try MutationLogRows.entries(in: [.queued, .deferred], db) {
            guard let sha256 = entry.command.attachedPhoto, let failure = failed[sha256] else {
                continue
            }
            let outcome = StoredOutcome.rejected(
                reason: failure.rejectionReason, message: failure.rejectionMessage)
            entry.outcome = outcome
            entry.state = outcome.state
            try MutationLogRows.update(entry, in: db)
            try RepairSettlement.record(outcome, for: entry, at: time, in: db)
            refused.insert(entry.entity)
        }
        guard !refused.isEmpty else { return }
        try MutationLogReplay.rebase(resetting: refused, in: db)
    }
}
