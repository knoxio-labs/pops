import AppCore

/// A generated placement type that can name itself as a ``WirePlacement``.
/// Every per-operation `PlacementPayload` below conforms, which is what lets
/// event decoding (`BFMInventoryEventWire.swift`) stay generic over which
/// operation produced the row.
internal protocol WirePlacementValue {
    var wire: WirePlacement { get }
}

/// The `previousPlacement` counterpart of ``WirePlacementValue``.
internal protocol WirePreviousPlacementValue {
    var wire: WirePreviousPlacement { get }
}

/// One item placement, read off any of the several nominal types the
/// generator produces for it — one per operation, because nothing in
/// `bfm.openapi.json` is `$ref`-shared (ADR-033: each pillar is discovered
/// over its own published document, not linked as a package). The shapes are
/// identical; only the Swift type is not, so this is what lets every call
/// site share one mapping into ``InventoryPlacement`` instead of one switch
/// per operation.
internal enum WirePlacement {
    case location(String)
    case container(String)
    case hand
}

/// A placement an in-hand item was taken from: never `hand` (ADR-002 D2).
internal enum WirePreviousPlacement {
    case location(String)
    case container(String)
}

extension InventoryPlacement {
    internal init(_ wire: WirePlacement) {
        switch wire {
        case .location(let id): self = .location(id)
        case .container(let id): self = .container(id)
        case .hand: self = .hand
        }
    }
}

extension InventoryPreviousPlacement {
    internal init(_ wire: WirePreviousPlacement) {
        switch wire {
        case .location(let id): self = .location(id)
        case .container(let id): self = .container(id)
        }
    }
}

extension Operations.MobileInventory_snapshot.Output.Ok.Body.JsonPayload.ItemsPayloadPayload
    .PlacementPayload: WirePlacementValue
{
    internal var wire: WirePlacement {
        switch self {
        case .case1(let location): .location(location.locationId)
        case .case2(let container): .container(container.itemId)
        case .case3: .hand
        }
    }
}

extension Operations.MobileInventory_snapshot.Output.Ok.Body.JsonPayload.ItemsPayloadPayload
    .PreviousPlacementPayload: WirePreviousPlacementValue
{
    internal var wire: WirePreviousPlacement {
        switch self {
        case .case1(let location): .location(location.locationId)
        case .case2(let container): .container(container.itemId)
        }
    }
}

extension Operations.MobileInventory_changes.Output.Ok.Body.JsonPayload.ItemsPayloadPayload
    .PlacementPayload: WirePlacementValue
{
    internal var wire: WirePlacement {
        switch self {
        case .case1(let location): .location(location.locationId)
        case .case2(let container): .container(container.itemId)
        case .case3: .hand
        }
    }
}

extension Operations.MobileInventory_changes.Output.Ok.Body.JsonPayload.ItemsPayloadPayload
    .PreviousPlacementPayload: WirePreviousPlacementValue
{
    internal var wire: WirePreviousPlacement {
        switch self {
        case .case1(let location): .location(location.locationId)
        case .case2(let container): .container(container.itemId)
        }
    }
}

extension Operations.MobileInventory_changes.Output.Ok.Body.JsonPayload.EventsPayloadPayload
    .BeforePayload.PlacementPayload: WirePlacementValue
{
    internal var wire: WirePlacement {
        switch self {
        case .case1(let location): .location(location.locationId)
        case .case2(let container): .container(container.itemId)
        case .case3: .hand
        }
    }
}

extension Operations.MobileInventory_changes.Output.Ok.Body.JsonPayload.EventsPayloadPayload
    .BeforePayload.PreviousPlacementPayload: WirePreviousPlacementValue
{
    internal var wire: WirePreviousPlacement {
        switch self {
        case .case1(let location): .location(location.locationId)
        case .case2(let container): .container(container.itemId)
        }
    }
}

extension Operations.MobileInventory_changes.Output.Ok.Body.JsonPayload.EventsPayloadPayload
    .AfterPayload.PlacementPayload: WirePlacementValue
{
    internal var wire: WirePlacement {
        switch self {
        case .case1(let location): .location(location.locationId)
        case .case2(let container): .container(container.itemId)
        case .case3: .hand
        }
    }
}

extension Operations.MobileInventory_changes.Output.Ok.Body.JsonPayload.EventsPayloadPayload
    .AfterPayload.PreviousPlacementPayload: WirePreviousPlacementValue
{
    internal var wire: WirePreviousPlacement {
        switch self {
        case .case1(let location): .location(location.locationId)
        case .case2(let container): .container(container.itemId)
        }
    }
}

extension Operations.MobileInventory_itemHistory.Output.Ok.Body.JsonPayload.EventsPayloadPayload
    .BeforePayload.PlacementPayload: WirePlacementValue
{
    internal var wire: WirePlacement {
        switch self {
        case .case1(let location): .location(location.locationId)
        case .case2(let container): .container(container.itemId)
        case .case3: .hand
        }
    }
}

extension Operations.MobileInventory_itemHistory.Output.Ok.Body.JsonPayload.EventsPayloadPayload
    .BeforePayload.PreviousPlacementPayload: WirePreviousPlacementValue
{
    internal var wire: WirePreviousPlacement {
        switch self {
        case .case1(let location): .location(location.locationId)
        case .case2(let container): .container(container.itemId)
        }
    }
}

extension Operations.MobileInventory_itemHistory.Output.Ok.Body.JsonPayload.EventsPayloadPayload
    .AfterPayload.PlacementPayload: WirePlacementValue
{
    internal var wire: WirePlacement {
        switch self {
        case .case1(let location): .location(location.locationId)
        case .case2(let container): .container(container.itemId)
        case .case3: .hand
        }
    }
}

extension Operations.MobileInventory_itemHistory.Output.Ok.Body.JsonPayload.EventsPayloadPayload
    .AfterPayload.PreviousPlacementPayload: WirePreviousPlacementValue
{
    internal var wire: WirePreviousPlacement {
        switch self {
        case .case1(let location): .location(location.locationId)
        case .case2(let container): .container(container.itemId)
        }
    }
}
