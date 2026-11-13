import AppCore
import Foundation

extension ProtectedTripDocumentStore {
    internal func originalGeneration(id: Int) throws -> UUID? {
        try assertCurrent()
        let generation = try manifest(id: id)?.record.generation
        try assertCurrent()
        return generation
    }

    internal func original(id: Int) throws -> TripOfflineFileRecord? {
        try assertCurrent()
        guard let manifest = try manifest(id: id) else { return nil }
        _ = try bytes(manifest)
        try assertCurrent()
        return manifest.record
    }

    internal func retainOriginal(
        _ download: DownloadedDocument, id: Int, verifiedAt: Date, replacing generation: UUID?
    ) throws -> TripOfflineFileRecord {
        try assertCurrent()
        guard id > 0, download.temporaryURL.isFileURL,
            try download.temporaryURL.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile
                == true
        else { throw TripDocumentOfflineError.invalidRecord }
        guard try originalGeneration(id: id) == generation else {
            throw TripDocumentOfflineError.generationChanged
        }
        let data = try Data(contentsOf: download.temporaryURL, options: .mappedIfSafe)
        if let count = download.metadata.byteCount, count != data.count {
            throw TripDocumentOfflineError.corruptOriginal
        }
        let record = TripOfflineFileRecord(
            owner: owner, documentID: id, generation: UUID(), verifiedAt: verifiedAt,
            byteCount: data.count, sha256: digest(data), metadata: download.metadata)
        let manifest = OriginalEnvelope(version: 1, record: record, blobID: UUID())
        try write(data, to: blobURL(manifest.blobID))
        _ = try bytes(manifest)
        try assertCurrent()
        guard try originalGeneration(id: id) == generation else {
            throw TripDocumentOfflineError.generationChanged
        }
        try write(JSONEncoder().encode(manifest), to: manifestURL(id: id))
        return record
    }

    internal func previewOriginal(id: Int) throws -> DownloadedDocument? {
        try assertCurrent()
        guard let manifest = try manifest(id: id) else { return nil }
        let data = try bytes(manifest)
        let temporary = FileManager.default.temporaryDirectory.appendingPathComponent(
            UUID().uuidString)
        do {
            try assertCurrent()
            try data.write(
                to: temporary,
                options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            try assertCurrent()
            return DownloadedDocument(temporaryURL: temporary, metadata: manifest.record.metadata)
        } catch {
            try? FileManager.default.removeItem(at: temporary)
            throw error
        }
    }

    private func manifest(id: Int) throws -> OriginalEnvelope? {
        guard id > 0 else { throw TripDocumentOfflineError.invalidRecord }
        let url = try manifestURL(id: id)
        guard let data = try readIfPresent(url) else { return nil }
        let attributes = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        guard attributes.isRegularFile == true, attributes.isSymbolicLink != true else {
            throw TripDocumentOfflineError.invalidRecord
        }
        let value: OriginalEnvelope = try decode(data)
        let record = value.record
        guard value.version == 1, record.owner == owner, record.documentID == id,
            record.byteCount >= 0, record.sha256.utf8.count == 64,
            record.sha256.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }),
            record.responseByteCount.map({ $0 >= 0 && $0 == record.byteCount }) ?? true
        else { throw TripDocumentOfflineError.invalidRecord }
        return value
    }

    private func bytes(_ manifest: OriginalEnvelope) throws -> Data {
        let url = try blobURL(manifest.blobID)
        let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true else {
            throw TripDocumentOfflineError.corruptOriginal
        }
        let data = try Data(contentsOf: url, options: .mappedIfSafe)
        guard data.count == manifest.record.byteCount, digest(data) == manifest.record.sha256 else {
            throw TripDocumentOfflineError.corruptOriginal
        }
        return data
    }

    private func blobURL(_ id: UUID) throws -> URL {
        try directory().appendingPathComponent("originals", isDirectory: true)
            .appendingPathComponent(id.uuidString)
    }

    private func manifestURL(id: Int) throws -> URL {
        try directory().appendingPathComponent("documents", isDirectory: true)
            .appendingPathComponent("\(id).json")
    }

    private struct OriginalEnvelope: Codable {
        let version: Int
        let record: TripOfflineFileRecord
        let blobID: UUID
    }
}
