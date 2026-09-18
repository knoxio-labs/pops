import Foundation

/// A POPS URI as the scanner reads it: an address for something anywhere in
/// the app, not only Inventory. The scan surface parses one of these, and
/// everything past parsing is either this pillar's own routing or a hand-off
/// to whichever feature owns the pillar named.
internal enum InventoryDeepLink: Equatable {
    case item(id: String)
    case container(id: String)
    case location(id: String)
    /// A well-formed `pops://` URI for a pillar this scanner does not parse
    /// further. QR is shared POPS routing, not an Inventory-only parser, so
    /// this is a real outcome and not an error.
    case otherPillar(name: String)
    /// Not a `pops://` URI at all, or missing the parts one needs.
    case malformed
}

internal enum InventoryDeepLinkParser {
    private static let scheme = "pops"

    /// Reads a scanned string as `pops://<pillar>/<kind>/<id>`. Only the
    /// `inventory` pillar's path is understood past the host; any other host
    /// that is otherwise a well-formed POPS URI comes back as
    /// ``InventoryDeepLink/otherPillar(name:)`` rather than
    /// ``InventoryDeepLink/malformed``, because Inventory not knowing a
    /// pillar's own paths is not the same as the code being unreadable.
    internal static func parse(_ raw: String) -> InventoryDeepLink {
        guard let url = URL(string: raw), url.scheme == scheme, let host = url.host, !host.isEmpty
        else {
            return .malformed
        }
        guard host == "inventory" else { return .otherPillar(name: host) }
        let components = url.pathComponents.filter { $0 != "/" }
        guard components.count >= 2 else { return .malformed }
        return entity(kind: components[0], id: components[1])
    }

    private static func entity(kind: String, id: String) -> InventoryDeepLink {
        switch kind {
        case "items": .item(id: id)
        case "containers": .container(id: id)
        case "locations": .location(id: id)
        default: .malformed
        }
    }
}
