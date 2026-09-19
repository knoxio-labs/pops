import Foundation
import Synchronization

/// Where the replica keeps photo bytes, one file per hash and variant: the
/// photos this phone staged for upload, and the variants it cached.
/// ``InventoryReplica`` records what each file is; this only stores it.
/// The on-disk replica uses its media cache directory; an in-memory one, and
/// a test that needs a file to go missing, use their own.
public protocol InventoryMediaFiles: Sendable {
    /// Replaces whatever is stored under `name`, all at once, so a crash
    /// never leaves half a file.
    func write(_ data: Data, named name: String) throws

    /// - Returns: `nil` when nothing is stored under `name`.
    func read(named name: String) throws -> Data?

    /// Removing a name that holds nothing is not an error.
    func remove(named name: String) throws
}

/// ``InventoryMediaFiles`` in a directory: the on-disk replica's media cache,
/// which is excluded from backup. Files take the replica's data protection,
/// so a background refresh can read a staged photo after first unlock.
internal struct DirectoryMediaFiles: InventoryMediaFiles {
    let directory: URL

    func write(_ data: Data, named name: String) throws {
        #if os(iOS)
            try data.write(
                to: url(name),
                options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
            try data.write(to: url(name), options: .atomic)
        #endif
    }

    func read(named name: String) throws -> Data? {
        let url = url(name)
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        return try Data(contentsOf: url)
    }

    func remove(named name: String) throws {
        let url = url(name)
        guard FileManager.default.fileExists(atPath: url.path) else { return }
        try FileManager.default.removeItem(at: url)
    }

    private func url(_ name: String) -> URL {
        directory.appendingPathComponent(name, isDirectory: false)
    }
}

/// ``InventoryMediaFiles`` held in memory, for the in-memory replica: gone
/// when the replica is.
public final class InMemoryMediaFiles: InventoryMediaFiles {
    private let files = Mutex<[String: Data]>([:])

    public init() {}

    public func write(_ data: Data, named name: String) throws {
        files.withLock { $0[name] = data }
    }

    public func read(named name: String) throws -> Data? {
        files.withLock { $0[name] }
    }

    public func remove(named name: String) throws {
        files.withLock { _ = $0.removeValue(forKey: name) }
    }
}
