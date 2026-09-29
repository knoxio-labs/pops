import Foundation

/// Stores the newest saved item-type ids on this device.
internal enum InventoryTypeRecents {
    internal static let key = "inventory.itemTypeRecents.v1"
    internal static let limit = 6

    internal static func load(
        from defaults: UserDefaults = .standard,
        validIDs: Set<String>
    ) -> [String] {
        decode(defaults.string(forKey: key) ?? "").filter { validIDs.contains($0) }
    }

    internal static func record(
        _ id: String, in defaults: UserDefaults = .standard
    ) {
        let current = decode(defaults.string(forKey: key) ?? "")
        let next = Array(([id] + current.filter { $0 != id }).prefix(limit))
        defaults.set(next.joined(separator: "\n"), forKey: key)
    }

    internal static func clear(from defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: key)
    }

    private static func decode(_ value: String) -> [String] {
        value.split(separator: "\n").map(String.init)
    }
}
