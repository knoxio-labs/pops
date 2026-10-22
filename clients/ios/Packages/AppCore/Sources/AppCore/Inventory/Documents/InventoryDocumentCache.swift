import Foundation

/// Downloaded document files and the last documents list each item showed,
/// under one caches directory the system may purge at any time.
///
/// A file lives at `<root>/files/<link id>/<file name>`: one file per
/// directory, so its size on disk is the whole of what the cache knows about
/// it. bfm relays no `ETag`, which leaves size as the only validator the file
/// route offers.
public struct InventoryDocumentCache: Sendable {
    private let root: URL

    public init(root: URL) {
        self.root = root
    }

    /// `Library/Caches/inventory-documents`.
    public static var standard: InventoryDocumentCache {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return InventoryDocumentCache(root: caches.appending(path: "inventory-documents"))
    }

    /// The cached copy of a linked document's file and its size, if any.
    public func file(for id: InventoryLinkedDocument.ID) -> (url: URL, byteCount: Int)? {
        let directory = fileDirectory(id)
        guard
            let name = try? FileManager.default.contentsOfDirectory(atPath: directory.path())
                .first(where: { !$0.hasPrefix(".") })
        else { return nil }
        let url = directory.appending(path: name)
        guard let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize else {
            return nil
        }
        return (url, size)
    }

    /// Moves a finished download into the cache, replacing any older copy.
    public func store(
        _ temporaryURL: URL, for id: InventoryLinkedDocument.ID,
        version: InventoryDocumentFileVersion
    ) throws -> URL {
        let directory = fileDirectory(id)
        let manager = FileManager.default
        if manager.fileExists(atPath: directory.path()) {
            try manager.removeItem(at: directory)
        }
        try manager.createDirectory(at: directory, withIntermediateDirectories: true)
        let destination = directory.appending(
            path: InventoryDocumentFileName.name(for: version, id: id))
        try manager.moveItem(at: temporaryURL, to: destination)
        return destination
    }

    /// Drops a link's cached file, for a link that no longer exists.
    public func remove(_ id: InventoryLinkedDocument.ID) {
        try? FileManager.default.removeItem(at: fileDirectory(id))
    }

    /// The list an item last showed, for drawing the section offline.
    public func snapshot(of itemId: InventoryItem.ID) -> InventoryItemDocuments? {
        guard let data = try? Data(contentsOf: snapshotURL(itemId)) else { return nil }
        return try? JSONDecoder().decode(InventoryItemDocuments.self, from: data)
    }

    public func saveSnapshot(_ documents: InventoryItemDocuments, of itemId: InventoryItem.ID) {
        let url = snapshotURL(itemId)
        guard let data = try? JSONEncoder().encode(documents) else { return }
        try? FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: url, options: .atomic)
    }

    private func fileDirectory(_ id: InventoryLinkedDocument.ID) -> URL {
        root.appending(path: "files").appending(path: String(id))
    }

    private func snapshotURL(_ itemId: InventoryItem.ID) -> URL {
        let safe = itemId.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? itemId
        return root.appending(path: "items").appending(path: "\(safe).json")
    }
}

/// The name a cached file is stored under. QuickLook picks a previewer from
/// the extension, so a name without one gets the content type's.
internal enum InventoryDocumentFileName {
    internal static func name(
        for version: InventoryDocumentFileVersion, id: InventoryLinkedDocument.ID
    ) -> String {
        let named = version.fileName.map(sanitised) ?? ""
        let base = named.isEmpty ? "document-\(id)" : named
        guard (base as NSString).pathExtension.isEmpty,
            let ext = version.contentType.flatMap(fileExtension(forMimeType:))
        else { return base }
        return "\(base).\(ext)"
    }

    private static func sanitised(_ name: String) -> String {
        let last = (name as NSString).lastPathComponent
        return last.replacing("/", with: "-").trimmingCharacters(in: .whitespaces)
            .trimmingCharacters(in: CharacterSet(charactersIn: "."))
    }

    private static func fileExtension(forMimeType mimeType: String) -> String? {
        let type = mimeType.split(separator: ";").first.map {
            $0.trimmingCharacters(in: .whitespaces).lowercased()
        }
        switch type {
        case "application/pdf": return "pdf"
        case "image/jpeg": return "jpg"
        case "image/png": return "png"
        case "image/heic": return "heic"
        case "image/gif": return "gif"
        case "image/tiff": return "tiff"
        case "image/webp": return "webp"
        case "text/plain": return "txt"
        case "text/csv": return "csv"
        case "text/html": return "html"
        default: return nil
        }
    }
}

/// What opening a linked document does, given what the cache holds and what
/// the server answered about the file.
public enum InventoryDocumentOpenDecision: Equatable, Sendable {
    /// The cached copy is current, or the server cannot be asked.
    case openCached
    /// No copy, or the copy is a different size from the server's.
    case download
    /// No copy, and no connection to fetch one.
    case needsConnection

    /// - Parameters:
    ///   - cachedByteCount: The cached copy's size, `nil` with no copy.
    ///   - remoteByteCount: The server's size, `nil` when it could not be
    ///     reached (see ``isUnreachable(_:)``).
    public static func decide(cachedByteCount: Int?, remoteByteCount: Int?)
        -> InventoryDocumentOpenDecision
    {
        switch (cachedByteCount, remoteByteCount) {
        case (nil, nil): .needsConnection
        case (.some, nil): .openCached
        case (let cached, let remote?): cached == remote ? .openCached : .download
        }
    }

    /// Failures where an older copy beats none: the phone or the documents
    /// path cannot answer, as opposed to the link being gone.
    public static func isUnreachable(_ error: any Error) -> Bool {
        switch error {
        case InventoryDocumentsError.offline, InventoryDocumentsError.unavailable,
            InventoryDocumentsError.paperlessNotConnected:
            true
        case RepositoryError.unavailable, RepositoryError.transport:
            true
        default:
            false
        }
    }
}

/// Opens a linked document's file: the cached copy when it is current or the
/// server cannot be reached, otherwise a fresh download into the cache.
public struct InventoryDocumentOpener: Sendable {
    private let service: any InventoryDocumentsService
    private let cache: InventoryDocumentCache

    public init(service: any InventoryDocumentsService, cache: InventoryDocumentCache) {
        self.service = service
        self.cache = cache
    }

    /// A local file URL to preview.
    ///
    /// - Throws: ``InventoryDocumentsError/needsConnection`` offline with no
    ///   copy; otherwise what the service threw. A link the server no longer
    ///   has loses its cached copy too.
    public func open(_ id: InventoryLinkedDocument.ID) async throws -> URL {
        let cached = cache.file(for: id)
        let remoteByteCount: Int?
        do {
            remoteByteCount = try await service.fileVersion(of: id).byteCount
        } catch {
            guard InventoryDocumentOpenDecision.isUnreachable(error) else {
                if case InventoryDocumentsError.notFound = error { cache.remove(id) }
                throw error
            }
            remoteByteCount = nil
        }
        switch InventoryDocumentOpenDecision.decide(
            cachedByteCount: cached?.byteCount, remoteByteCount: remoteByteCount)
        {
        case .openCached:
            guard let cached else { throw InventoryDocumentsError.needsConnection }
            return cached.url
        case .needsConnection:
            throw InventoryDocumentsError.needsConnection
        case .download:
            let (temporaryURL, version) = try await service.downloadFile(of: id)
            return try cache.store(temporaryURL, for: id, version: version)
        }
    }
}
