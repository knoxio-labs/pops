import Foundation

/// The Sync page header's line and glyph for each status.
extension InventorySyncView {
    internal static func statusLine(_ status: InventorySyncHeaderStatus) -> String {
        switch status {
        case .online(let since):
            since.map { "Synced \(InventoryRelativeTime.text($0))" } ?? "Synced"
        case .offline(let since):
            since.map { "Offline · synced \(InventoryRelativeTime.text($0))" } ?? "Offline"
        case .syncing(let count):
            "Syncing \(count) \(count == 1 ? "change" : "changes")"
        case .stuck(let waiting) where waiting > 0:
            "Can't send \(waiting) \(waiting == 1 ? "change" : "changes")"
        case .stuck:
            "Changes can't be sent"
        case .updatingFields:
            "Updating fields"
        }
    }

    internal static func statusSymbol(_ status: InventorySyncHeaderStatus) -> InventorySymbol {
        switch status {
        case .online: .synced
        case .offline: .stale
        case .syncing: .queued
        case .stuck: .attention
        case .updatingFields: .refreshFields
        }
    }
}
