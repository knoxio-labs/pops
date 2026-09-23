import AppCore
import Foundation

/// The empty search's two memories, kept on this phone only: what was
/// searched for, and what was scanned. Neither is replica state, so neither
/// syncs; each is a short newest-first list stored as one line per entry.
internal enum InventorySearchRecents {
    /// The defaults key for past queries.
    internal static let queriesKey = "inventory.search.recentQueries"
    /// The defaults key for the ids of recently scanned items, written by the
    /// scanner and read here.
    internal static let scannedKey = "inventory.search.recentlyScanned"
    /// How many of each the empty search shows.
    internal static let limit = 6

    internal static func decode(_ stored: String) -> [String] {
        stored.split(separator: "\n").map(String.init)
    }

    internal static func encode(_ entries: [String]) -> String {
        entries.joined(separator: "\n")
    }

    /// `entry` moved to the front, compared without regard to case or the
    /// spaces around it, and the list cut to `limit`. A blank entry changes
    /// nothing.
    internal static func adding(_ entry: String, to entries: [String]) -> [String] {
        let trimmed = entry.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return entries }
        let others = entries.filter { $0.caseInsensitiveCompare(trimmed) != .orderedSame }
        return Array(([trimmed] + others).prefix(limit))
    }

    internal static func recordingScan(_ id: InventoryItem.ID, in defaults: UserDefaults) {
        let current = decode(defaults.string(forKey: scannedKey) ?? "")
        defaults.set(encode(adding(id, to: current)), forKey: scannedKey)
    }
}
