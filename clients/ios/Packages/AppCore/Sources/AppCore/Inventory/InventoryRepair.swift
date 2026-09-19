import Foundation

/// Where one side of a disagreement came from, per ADR-002 D8's event actor.
///
/// Never decoded as `.thisDevice`: the wire's conflict source carries only a
/// `kind` and a `label` (ADR-002's wire contract), never the id this app's
/// own device holds, so nothing at the decoding edge can tell "another
/// phone" apart from "this one" by label alone. A caller that wants that
/// distinction has to compare the label itself against its own.
public enum InventorySyncSource: Hashable, Sendable {
    case thisDevice
    case otherDevice(label: String)
    case web
    case service(account: String)
    /// An actor kind this build has never heard of, kept verbatim.
    case unrecognised(kind: String, label: String)
}

/// What kind of repair a change needs, and so which two ways out it offers.
/// Mirrors the outcome kinds ADR-002's wire contract declares for a mutation
/// conflict, plus `photoFailed` for a media upload the server never took.
/// Kept open (`unrecognised`) for the same reason `InventoryLifecycle` is:
/// D10 lets the set of outcomes grow without a protocol bump for additive
/// cases, so an old app meets an unknown one with no inline fix rather than
/// refusing to show the repair at all.
public enum InventoryRepairKind: Hashable, Sendable {
    /// The same field was changed here and elsewhere.
    case conflict
    /// The code printed here is already on another record.
    case codeCollision
    /// The record was deleted on another device.
    case deletedElsewhere
    /// A photo taken here could not be uploaded.
    case photoFailed
    case unrecognised(String)

    public init(wireOutcomeKind: String) {
        switch wireOutcomeKind {
        case "field": self = .conflict
        case "code_collision": self = .codeCollision
        case "deleted": self = .deletedElsewhere
        default: self = .unrecognised(wireOutcomeKind)
        }
    }
}

/// One side of a conflict: the value, where it came from, and when.
public struct InventoryRepairOption: Identifiable, Hashable, Sendable {
    public let value: String
    public let source: InventorySyncSource
    public let at: Date

    public init(value: String, source: InventorySyncSource, at: Date) {
        self.value = value
        self.source = source
        self.at = at
    }

    public var id: String { "\(source)-\(value)" }
}

/// One change the server would not take as it was, and what it needs. `id` is
/// the mutation id that raised it, which is what a resolution and its undo
/// both key on.
public struct InventoryRepair: Identifiable, Hashable, Sendable {
    public let id: String
    public let entityKind: InventoryEntityKind
    public let entityId: String
    public let kind: InventoryRepairKind
    /// The field a conflict is about; nil for every other kind.
    public let field: String?
    /// A conflict's two sides, this phone's first.
    public let options: [InventoryRepairOption]
    /// The code a collision proposes instead.
    public let suggestedCode: String?
    /// Who already holds the colliding code, for `codeCollision`'s "B412 is
    /// on Kitchen 09" line. Mirrors the wire outcome's `heldBy.name`.
    public let heldByName: String?
    public let openedAt: Date

    public init(
        id: String,
        entityKind: InventoryEntityKind,
        entityId: String,
        kind: InventoryRepairKind,
        field: String? = nil,
        options: [InventoryRepairOption] = [],
        suggestedCode: String? = nil,
        heldByName: String? = nil,
        openedAt: Date
    ) {
        self.id = id
        self.entityKind = entityKind
        self.entityId = entityId
        self.kind = kind
        self.field = field
        self.options = options
        self.suggestedCode = suggestedCode
        self.heldByName = heldByName
        self.openedAt = openedAt
    }
}

/// The choice a person makes on a repair, passed to
/// `InventoryStore.resolve(_:with:)`. Each kind offers exactly one pair (D8,
/// D7): the mutation's own value, or the other side.
public enum InventoryRepairChoice: Hashable, Sendable {
    /// Keep this phone's value: re-sends the change rebased on the current
    /// revision (`conflict`), relabels with a chosen code
    /// (`codeCollision`, with the code to use), or restores a deleted record
    /// (`deletedElsewhere`) before replaying the original change. Retries the
    /// upload for `photoFailed`.
    case keepMine(code: String? = nil)
    /// Discard this phone's value: rebases on the server's value
    /// (`conflict`), drops the code (`codeCollision`), lets the deletion
    /// stand (`deletedElsewhere`), or drops the attach and unpins the bytes
    /// (`photoFailed`).
    case discardMine
}
