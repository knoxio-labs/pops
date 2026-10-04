import Foundation

/// What kind of change an event records. Server event names map one-to-one to
/// cases; unknown names stay available for forward-compatible rendering.
public enum InventoryEventKind: Hashable, Sendable {
    case created
    case edited
    case typeChanged
    case fieldValuesChanged
    case overrideSet
    case overrideCleared
    case codeSet
    case moved
    case pickedUp
    case putBack
    case stored
    case opened
    case closed
    case sealed
    case unpacked
    case lifecycleChanged
    case quantityChanged
    case splitFrom
    case splitInto
    case photoAdded
    case photoRemoved
    case deleted
    case restored
    case reverted
    case migrated
    /// An event kind this build has never heard of, kept verbatim.
    case unrecognised(String)

    public init(wire: String) {
        self = Self.byWireValue[wire] ?? .unrecognised(wire)
    }

    /// A lookup table rather than a `switch`: every one of these cases is an
    /// equally weighted, independent mapping with no shared logic between
    /// them, which is exactly what a dictionary states more plainly than
    /// twenty branches of one function do.
    private static let byWireValue: [String: InventoryEventKind] = [
        "created": .created,
        "edited": .edited,
        "type_changed": .typeChanged,
        "field_values_changed": .fieldValuesChanged,
        "override_set": .overrideSet,
        "override_cleared": .overrideCleared,
        "code_set": .codeSet,
        "moved": .moved,
        "picked_up": .pickedUp,
        "put_back": .putBack,
        "stored": .stored,
        "opened": .opened,
        "closed": .closed,
        "sealed": .sealed,
        "unpacked": .unpacked,
        "lifecycle_changed": .lifecycleChanged,
        "quantity_changed": .quantityChanged,
        "split_from": .splitFrom,
        "split_into": .splitInto,
        "photo_added": .photoAdded,
        "photo_removed": .photoRemoved,
        "deleted": .deleted,
        "restored": .restored,
        "reverted": .reverted,
        "migrated": .migrated,
    ]
}

/// Who made a change, per ADR-002 D4 and D12. A device carries the label bfm
/// forwards in `Pops-Actor`; `service` carries the calling account's name.
///
/// Sent on the wire as an open string, like `InventoryLifecycle` (D10): a new
/// actor kind can ship without a protocol bump, so this decodes an unknown
/// one to `.unrecognised` rather than refusing the whole event.
public enum InventoryEventActor: Hashable, Sendable {
    case device(id: String, label: String)
    case web
    case service(account: String)
    case migration
    /// An actor kind this build has never heard of, kept verbatim.
    case unrecognised(kind: String, label: String)
}

/// One line of an item's or location's history, per ADR-002 D4. `before` and
/// `after` are keyed by field name; a field absent from both was untouched by
/// this event.
public struct InventoryEvent: Identifiable, Hashable, Sendable {
    public let seq: Int
    public let entityKind: InventoryEntityKind
    public let entityId: String
    public let kind: InventoryEventKind
    public let fields: [String]
    public let before: [String: InventoryFieldValue]
    public let after: [String: InventoryFieldValue]
    public let reason: InventoryDiscardReason?
    public let actor: InventoryEventActor
    public let clientTime: Date?
    public let serverTime: Date
    /// The `seq` of the event this one undoes, when it is a compensating
    /// event.
    public let compensatesSeq: Int?
    /// Whether this event is still the latest change to every field it
    /// touched, and was not a `destroyed` transition — the two conditions
    /// D4's revert needs.
    public let undoable: Bool

    public init(
        seq: Int,
        entityKind: InventoryEntityKind,
        entityId: String,
        kind: InventoryEventKind,
        fields: [String],
        before: [String: InventoryFieldValue],
        after: [String: InventoryFieldValue],
        reason: InventoryDiscardReason?,
        actor: InventoryEventActor,
        clientTime: Date?,
        serverTime: Date,
        compensatesSeq: Int?,
        undoable: Bool
    ) {
        self.seq = seq
        self.entityKind = entityKind
        self.entityId = entityId
        self.kind = kind
        self.fields = fields
        self.before = before
        self.after = after
        self.reason = reason
        self.actor = actor
        self.clientTime = clientTime
        self.serverTime = serverTime
        self.compensatesSeq = compensatesSeq
        self.undoable = undoable
    }

    public var id: Int { seq }
}

/// Which table an event, a mutation or a repair is about.
public enum InventoryEntityKind: Hashable, Sendable {
    case item
    case location
}
