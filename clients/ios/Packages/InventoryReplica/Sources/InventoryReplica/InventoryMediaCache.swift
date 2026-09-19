import AppCore
import Foundation
import Synchronization

/// A small in-memory cache in front of `fetchMedia`, keyed by hash and
/// variant. Deliberately not disk-backed and not the LRU-at-500-MB budget
/// ADR-002 gives the media cache proper (that is `C4`, a later slice): this
/// is only enough to stop a screen re-fetching the same thumbnail every time
/// it redraws, and it holds nothing across a relaunch.
///
/// Bounded by entry count rather than by bytes, because that is the
/// question this cache actually answers ("did we just ask for this hash");
/// bounding it by decoded size belongs to the real media cache, not this
/// stand-in for it.
internal final class InventoryMediaCache: Sendable {
    private struct Entry {
        let key: String
        let data: Data
    }

    private let capacity: Int
    private let state: Mutex<[Entry]>

    internal init(capacity: Int = 64) {
        self.capacity = capacity
        state = Mutex([])
    }

    internal func value(sha256: String, variant: InventoryPhotoVariant) -> Data? {
        state.withLock { entries in
            entries.first { $0.key == Self.key(sha256, variant) }?.data
        }
    }

    internal func set(_ data: Data, sha256: String, variant: InventoryPhotoVariant) {
        let key = Self.key(sha256, variant)
        state.withLock { entries in
            entries.removeAll { $0.key == key }
            entries.append(Entry(key: key, data: data))
            if entries.count > capacity { entries.removeFirst(entries.count - capacity) }
        }
    }

    private static func key(_ sha256: String, _ variant: InventoryPhotoVariant) -> String {
        "\(sha256)#\(variant)"
    }
}
