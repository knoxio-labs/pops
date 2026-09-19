import AppCore
import OpenAPIRuntime

/// A generated event actor: `{kind, label}` on every operation that carries
/// one, per `pillars/inventory/src/domain/commands/outcome.ts`'s
/// `conflictSourceSchema`.
internal protocol WireActor {
    var kind: Swift.String { get }
    var label: Swift.String { get }
}

/// A generated `entityKind` enum: `item` or `location`.
internal protocol WireEntityKind {
    var isLocation: Bool { get }
}

/// One event's `before` or `after`: the placement pair plus every other
/// touched field, keyed by name. Conforming a per-operation `Before`/`After`
/// type is what lets `fieldValues(from:touching:)` below read any of them.
internal protocol WireEventValues {
    associatedtype Placement: WirePlacementValue
    associatedtype PreviousPlacement: WirePreviousPlacementValue

    var placement: Placement? { get }
    var previousPlacement: PreviousPlacement? { get }
    var additionalProperties: [Swift.String: OpenAPIValueContainer] { get }
}

/// One history entry, generic over whichever operation produced it
/// (`changes` or `itemHistory`) — the two never share a Swift type
/// (ADR-033), but their JSON is identical field for field.
internal protocol WireEventRow {
    associatedtype Before: WireEventValues
    associatedtype After: WireEventValues
    associatedtype EntityKind: WireEntityKind
    associatedtype Actor: WireActor

    var seq: Int { get }
    var entityKind: EntityKind { get }
    var entityId: Swift.String { get }
    var kind: Swift.String { get }
    var fields: [Swift.String] { get }
    var before: Before { get }
    var after: After { get }
    var reason: Swift.String? { get }
    var actor: Actor { get }
    var clientTime: Swift.String? { get }
    var serverTime: Swift.String { get }
    var compensatesSeq: Int? { get }
    var undoable: Bool { get }
}

/// Maps one generated event row into ``InventoryEvent``, whichever operation
/// produced its type.
///
/// - Throws: ``RepositoryError/contractMismatch`` when `serverTime` is not a
///   value this build can parse — the one field every reader of history
///   needs and that has no safe placeholder.
internal func inventoryEvent<Row: WireEventRow>(from wire: Row) throws -> InventoryEvent {
    guard let serverTime = ISO8601Instant.parse(wire.serverTime) else {
        throw RepositoryError.contractMismatch
    }
    return InventoryEvent(
        seq: wire.seq,
        entityKind: wire.entityKind.isLocation ? .location : .item,
        entityId: wire.entityId,
        kind: InventoryEventKind(wire: wire.kind),
        fields: wire.fields,
        before: fieldValues(from: wire.before, touching: wire.fields),
        after: fieldValues(from: wire.after, touching: wire.fields),
        reason: wire.reason.map(InventoryDiscardReason.init(wire:)),
        actor: inventoryEventActor(kind: wire.actor.kind, label: wire.actor.label),
        clientTime: wire.clientTime.flatMap(ISO8601Instant.parse),
        serverTime: serverTime,
        compensatesSeq: wire.compensatesSeq,
        undoable: wire.undoable
    )
}

/// `before`/`after`'s placement pair, plus every other touched field decoded
/// structurally (`BFMInventoryFieldValueWire`). A key this build cannot
/// decode is dropped rather than failing the whole event: `fields` already
/// names it as touched, so a reader can still show "changed" without the
/// value.
private func fieldValues<Values: WireEventValues>(
    from values: Values, touching fields: [String]
) -> [String: InventoryFieldValue] {
    var result: [String: InventoryFieldValue] = [:]
    if fields.contains("placement"), let placement = values.placement {
        result["placement"] = .placement(InventoryPlacement(placement.wire))
    }
    if fields.contains("previousPlacement"), let previous = values.previousPlacement {
        result["previousPlacement"] = .previousPlacement(InventoryPreviousPlacement(previous.wire))
    }
    for (key, container) in values.additionalProperties {
        if let value = BFMInventoryFieldValueWire.decode(container) {
            result[key] = value
        }
    }
    return result
}

/// An event's actor, from the `{kind, label}` the wire always carries.
/// `device`'s `id` has no wire counterpart on this route (the mobile relay
/// never sends one, only the label) so it is set to the label itself — the
/// one identifier this call actually has.
private func inventoryEventActor(kind: String, label: String) -> InventoryEventActor {
    switch kind {
    case "device": .device(id: label, label: label)
    case "web": .web
    case "service": .service(account: label)
    case "migration": .migration
    default: .unrecognised(kind: kind, label: label)
    }
}

extension Operations.MobileInventory_changes.Output.Ok.Body.JsonPayload.EventsPayloadPayload
    .BeforePayload: WireEventValues
{}
extension Operations.MobileInventory_changes.Output.Ok.Body.JsonPayload.EventsPayloadPayload
    .AfterPayload: WireEventValues
{}
extension Operations.MobileInventory_itemHistory.Output.Ok.Body.JsonPayload.EventsPayloadPayload
    .BeforePayload: WireEventValues
{}
extension Operations.MobileInventory_itemHistory.Output.Ok.Body.JsonPayload.EventsPayloadPayload
    .AfterPayload: WireEventValues
{}

extension Operations.MobileInventory_changes.Output.Ok.Body.JsonPayload.EventsPayloadPayload
    .ActorPayload: WireActor
{}
extension Operations.MobileInventory_itemHistory.Output.Ok.Body.JsonPayload.EventsPayloadPayload
    .ActorPayload: WireActor
{}

extension Operations.MobileInventory_changes.Output.Ok.Body.JsonPayload.EventsPayloadPayload
    .EntityKindPayload: WireEntityKind
{
    internal var isLocation: Bool { self == .location }
}
extension Operations.MobileInventory_itemHistory.Output.Ok.Body.JsonPayload.EventsPayloadPayload
    .EntityKindPayload: WireEntityKind
{
    internal var isLocation: Bool { self == .location }
}

extension Operations.MobileInventory_changes.Output.Ok.Body.JsonPayload.EventsPayloadPayload:
    WireEventRow
{}
extension Operations.MobileInventory_itemHistory.Output.Ok.Body.JsonPayload.EventsPayloadPayload:
    WireEventRow
{}
