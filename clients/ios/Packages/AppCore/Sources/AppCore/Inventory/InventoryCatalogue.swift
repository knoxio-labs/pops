/// A type's fields, and a value stored against one, per ADR-002 D5: types are
/// code on the server and a served catalogue on the phone. This file is the
/// closed vocabulary the catalogue is built from; growing it needs a value
/// kind, dimension or capability the app does not already know, which is a
/// protocol bump (D10), not a new case decoded loosely at the edge.

/// The shape one field's value takes. Closed, because D5 makes the value-kind
/// vocabulary part of the protocol: a server offering a new kind raises the
/// minimum protocol version, which an old app meets with the blocking
/// "This app is too old" state rather than by guessing at an unknown shape.
public enum InventoryFieldValueKind: Hashable, Sendable {
    case text
    case choice
    case flag
    case measurement
    case range
    case link
}

/// One field a type declares.
public struct InventoryFieldDefinition: Identifiable, Hashable, Sendable {
    public let key: String
    public let label: String
    public let kind: InventoryFieldValueKind
    /// The physical quantity a measurement or range field is in, e.g. "mass".
    /// `units.ts` on the server is the source of truth for which units share
    /// a dimension and how they convert.
    public let dimension: String?
    /// The unit a value is stored in when the field is first set. POPS-4015:
    /// a value keeps the unit it was typed in rather than being normalised.
    public let defaultUnit: String?
    public let choices: [String]?
    /// Whether this field sits beside the placement on the item detail page,
    /// rather than under Details.
    public let highlighted: Bool
    public let required: Bool

    public init(
        key: String,
        label: String,
        kind: InventoryFieldValueKind,
        dimension: String? = nil,
        defaultUnit: String? = nil,
        choices: [String]? = nil,
        highlighted: Bool = false,
        required: Bool = false
    ) {
        self.key = key
        self.label = label
        self.kind = kind
        self.dimension = dimension
        self.defaultUnit = defaultUnit
        self.choices = choices
        self.highlighted = highlighted
        self.required = required
    }

    public var id: String { key }
}

/// What a type grants beyond its fields. `containment` is the only one D1
/// defines; the set is closed for the same reason value kinds are.
public enum InventoryCapability: Hashable, Sendable {
    case containment
}

/// One entry of the catalogue `GET /types` serves: `defineType` on the
/// server, projected.
public struct InventoryType: Identifiable, Hashable, Sendable {
    public let key: String
    public let name: String
    public let capabilities: [InventoryCapability]
    public let fields: [InventoryFieldDefinition]
    /// Labels a legacy, untyped row may carry, matched against migrated
    /// `legacy_type` text to drive the "type arrived" sheet (D5).
    public let legacyLabels: [String]

    public init(
        key: String,
        name: String,
        capabilities: [InventoryCapability],
        fields: [InventoryFieldDefinition],
        legacyLabels: [String] = []
    ) {
        self.key = key
        self.name = name
        self.capabilities = capabilities
        self.fields = fields
        self.legacyLabels = legacyLabels
    }

    public var id: String { key }
    public var isContainer: Bool { capabilities.contains(.containment) }
}

/// One entry of the unit table: its dimension and how it converts to that
/// dimension's base unit.
public struct InventoryUnit: Identifiable, Hashable, Sendable {
    public let key: String
    public let dimension: String
    public let multiplierToBase: Double

    public init(key: String, dimension: String, multiplierToBase: Double) {
        self.key = key
        self.dimension = dimension
        self.multiplierToBase = multiplierToBase
    }

    public var id: String { key }
}

/// The projected type catalogue a snapshot or a `GET /types` response
/// carries. `version` is a hash of its own serialisation (D5): a change in it
/// is what the "type arrived" sheet and the shown-once flag key off.
public struct InventoryCatalogue: Hashable, Sendable {
    public let version: String
    public let units: [InventoryUnit]
    public let types: [InventoryType]

    public init(version: String, units: [InventoryUnit], types: [InventoryType]) {
        self.version = version
        self.units = units
        self.types = types
    }

    public func type(forKey key: String) -> InventoryType? {
        types.first { $0.key == key }
    }
}

/// One measurement value: what a `measurement` or `range` field stores,
/// carrying the unit it was recorded in.
public struct InventoryMeasurement: Hashable, Sendable {
    public let value: Double
    public let unit: String

    public init(value: Double, unit: String) {
        self.value = value
        self.unit = unit
    }
}

/// One range value: two measurements sharing a unit.
public struct InventoryRange: Hashable, Sendable {
    public let low: Double
    public let high: Double
    public let unit: String

    public init(low: Double, high: Double, unit: String) {
        self.low = low
        self.high = high
        self.unit = unit
    }
}

/// One field's value, shaped by the `InventoryFieldValueKind` its type
/// declares.
///
/// `placement` and `previousPlacement` are not catalogue kinds — no type ever
/// declares a field of either shape, so they are absent from
/// `InventoryFieldValueKind`. They exist here because `InventoryEvent.before`
/// and `.after` are keyed dictionaries of this same type (ADR-002 D4), and a
/// move's history entry carries exactly these two row-shaped values rather
/// than a catalogue-typed one (`pillars/inventory/src/contract/rest-sync-schemas.ts`'s
/// `SyncEventValuesSchema`). A second dictionary type for two keys would only
/// be a second thing for a reader of `InventoryEvent` to know about.
public enum InventoryFieldValue: Hashable, Sendable {
    case text(String)
    case choice(String)
    case flag(Bool)
    case measurement(InventoryMeasurement)
    case range(InventoryRange)
    case link(String)
    case placement(InventoryPlacement)
    case previousPlacement(InventoryPreviousPlacement)
}
