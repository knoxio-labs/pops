import Foundation

extension TripOfflineReadCoordinator {
    /// Reports only an eligible, integrity-checked original already retained for this pairing.
    /// This performs no network read; metadata and associations alone return no file record.
    public func retainedOriginal(id: Int) throws -> TripOfflineFileRecord? {
        guard id > 0 else { throw RepositoryError.requestRejected }
        guard let navigation = try navigation(), !invalidated(.file(id), in: navigation),
            !invalidated(.document(id), in: navigation)
        else { return nil }
        let record = try store.original(id: id)
        try assertCurrent()
        return record
    }

    /// Reads the owner's metadata, preserving missing as a durable tombstone rather than stale success.
    public func document(id: Int) async throws -> DocumentOriginal? {
        guard id > 0 else { throw RepositoryError.requestRejected }
        let resource = TripOfflineReadResource.document(id)
        let token = try begin(resource)
        let original: DocumentOriginal?
        do {
            original = try await remoteDocuments.document(id: id)
        } catch {
            try check(token, resource)
            let navigation = try fallback(after: error, resource: resource)
            guard let saved = navigation.originals.first(where: { $0.original.id == id })
            else { throw error }
            provenance[resource] = .lastVerified(verifiedAt: saved.verifiedAt)
            return saved.original
        }
        try check(token, resource)
        guard let original else {
            try invalidate(resource)
            return nil
        }
        guard original.id == id else {
            try invalidate(resource)
            throw RepositoryError.contractMismatch
        }
        let date = now()
        try update { previous in
            var originals = previous.originals.filter { $0.original.id != id }
            originals.append(VerifiedDocumentOriginal(original: original, verifiedAt: date))
            var blocked = previous.invalidatedResources ?? []
            blocked.remove(resource)
            return previous.replacing(originals: originals, invalidations: blocked)
        }
        verified(resource, at: date)
        return original
    }

    /// Retains completed remote bytes before previewing, or opens a verified protected copy after unavailability.
    /// A file 404 invalidates the old file independently of metadata and remains invalid after restart.
    public func file(id: Int) async throws -> DownloadedDocument {
        guard id > 0 else { throw RepositoryError.requestRejected }
        let resource = TripOfflineReadResource.file(id)
        let token = try begin(resource)
        let download: DownloadedDocument
        do {
            download = try await remoteDocuments.file(id: id)
        } catch {
            return try fallbackFile(after: error, id: id, token: token)
        }
        defer { try? FileManager.default.removeItem(at: download.temporaryURL) }
        try check(token, resource)
        let date = now()
        let generation = try store.originalGeneration(id: id)
        _ = try store.retainOriginal(download, id: id, verifiedAt: date, replacing: generation)
        try update { previous in
            var blocked = previous.invalidatedResources ?? []
            blocked.remove(resource)
            return previous.replacing(invalidations: blocked)
        }
        guard let copy = try store.previewOriginal(id: id) else {
            throw TripDocumentOfflineError.corruptOriginal
        }
        do {
            try check(token, resource)
            verified(resource, at: date)
            return copy
        } catch {
            try? FileManager.default.removeItem(at: copy.temporaryURL)
            throw error
        }
    }

    private func fallbackFile(after error: any Error, id: Int, token: UUID) throws
        -> DownloadedDocument
    {
        let resource = TripOfflineReadResource.file(id)
        try check(token, resource)
        if let access = error as? DocumentAccessError, access == .notFound {
            try invalidate(resource)
            throw error
        }
        let navigation = try fallback(after: error, resource: resource)
        guard !invalidated(.document(id), in: navigation),
            let record = try retainedOriginal(id: id),
            let copy = try store.previewOriginal(id: id)
        else { throw error }
        do {
            try check(token, resource)
            provenance[resource] = .lastVerified(verifiedAt: record.verifiedAt)
            return copy
        } catch {
            try? FileManager.default.removeItem(at: copy.temporaryURL)
            throw error
        }
    }
}
