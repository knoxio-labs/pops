import AppCore

/// A record a `pops://inventory/<type>/<id>` reference names: what a scanned
/// label or an opened link resolves to once the composition root's
/// `EntityRouter` hands it to this feature.
public enum InventoryEntity: Hashable, Sendable, Identifiable {
    case item(InventoryItem.ID)
    case location(InventoryLocation.ID)

    /// The pillar segment every reference this feature resolves carries.
    public static let pillar = "inventory"

    /// The type segments this feature resolves, one `EntityRouter`
    /// registration each. A container is an item, so there is no third.
    public static let types = ["item", "location"]

    /// The record `uri` names, or nil when it is not an Inventory reference
    /// this feature has a screen for.
    public init?(_ uri: PopsURI) {
        guard uri.pillar == Self.pillar else { return nil }
        switch uri.type {
        case "item": self = .item(uri.id)
        case "location": self = .location(uri.id)
        default: return nil
        }
    }

    public var id: String {
        switch self {
        case .item(let id): "item/\(id)"
        case .location(let id): "location/\(id)"
        }
    }

    /// The screen the reference opens: a place's page, a container's page when
    /// the item is one, and item detail otherwise, including for an item this
    /// replica does not hold, whose detail says so.
    internal func route(resolving item: InventoryItem?) -> InventoryRoute {
        switch self {
        case .location(let id): .place(id)
        case .item(let id): .record(id: id, isContainer: item?.isContainer ?? false)
        }
    }
}
