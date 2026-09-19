import AppCore
import CryptoKit
import Foundation
import GRDB
import Synchronization

@testable import InventoryReplica

internal enum PhotoFixture {
    static let time = MutationLogPerformTests.time
    static let bytes = Data("a photo taken in the garage".utf8)
    static let sha256 = hash(bytes)

    static func hash(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    /// A replica holding a lamp and a mug, with `bytes` staged.
    static func staged(files: any InventoryMediaFiles = InMemoryMediaFiles()) throws
        -> InventoryReplica
    {
        let replica = try InventoryReplica(now: { Fixture.created }, mediaFiles: files)
        try replica.apply(
            Fixture.snapshot(items: [
                Fixture.item("lamp", name: "Lamp", revision: 4),
                Fixture.item("mug", name: "Mug", revision: 2),
            ]))
        _ = try replica.stagePhoto(sha256: sha256, data: bytes, contentType: .jpeg)
        return replica
    }

    static func attach(_ id: String, on replica: InventoryReplica, itemId: String = "mug")
        throws
    {
        _ = try replica.perform(
            .attachPhoto(itemId: itemId, sha256: sha256, position: 0), mutationId: id,
            clientTime: time)
    }
}

/// The order a drain made its calls in, across uploads and batches.
internal final class CallOrder: Sendable {
    private let calls = Mutex<[String]>([])

    var all: [String] { calls.withLock { $0 } }

    func note(_ call: String) {
        calls.withLock { $0.append(call) }
    }

    /// A batch handler that notes each mutation id sent, then answers as
    /// `answer` does.
    func submitting(
        _ answer: @escaping FakeSyncTransport.SubmitHandler = DrainFixture.answering([:])
    ) -> FakeSyncTransport.SubmitHandler {
        { [self] mutations in
            for mutation in mutations { note("submit \(mutation.mutationId)") }
            return try await answer(mutations)
        }
    }

    /// An upload handler that notes the upload, then answers with `result`.
    func uploading(
        _ result: @escaping @Sendable (String) throws -> InventoryMediaUploadResult = {
            InventoryMediaUploadResult(sha256: $0, alreadyStored: false)
        }
    ) -> FakeSyncTransport.UploadHandler {
        { [self] sha256, _, _ in
            note("upload \(sha256.prefix(6))")
            return try result(sha256)
        }
    }
}

extension InventoryReplica {
    /// Whether the staged bytes for `sha256` may not be evicted; false when
    /// nothing is staged under it.
    func isPinned(_ sha256: String) throws -> Bool {
        try database.read { db in
            try Bool.fetchOne(
                db, sql: "SELECT pinned FROM media WHERE sha256 = ? AND variant = 'full'",
                arguments: [sha256]) ?? false
        }
    }

    var photoUploads: [String: InventoryPhotoUpload] {
        get throws { try read(.photoUploads) }
    }
}
