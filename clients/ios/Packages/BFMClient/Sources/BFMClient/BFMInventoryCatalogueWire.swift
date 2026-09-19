import AppCore

/// Maps `GET /mobile/inventory/types`'s body into ``InventoryCatalogue``.
///
/// The catalogue is D5's closed vocabulary: a field kind this build has
/// never heard of is not something an old app can render generically the way
/// `InventoryLifecycle` renders an unrecognised value, because a screen has
/// to know a measurement's shape to draw an input for it. That is
/// `426 client_too_old`'s job upstream; meeting one here without a protocol
/// bump means the server and this build have drifted in a way the protocol
/// header did not catch, which is a contract mismatch rather than something
/// to decode around.
internal enum BFMInventoryCatalogueWire {
    internal static func catalogue(
        version: String,
        units: [WireCatalogueUnit],
        types: [WireCatalogueType]
    ) throws -> InventoryCatalogue {
        InventoryCatalogue(
            version: version,
            units: units.map {
                InventoryUnit(
                    key: $0.symbol, dimension: $0.dimension, multiplierToBase: $0.multiplier)
            },
            types: try types.map(type(from:))
        )
    }

    private static func type(from wire: WireCatalogueType) throws -> InventoryType {
        InventoryType(
            key: wire.key,
            name: wire.name,
            capabilities: wire.capabilities.compactMap {
                $0 == "containment" ? .containment : nil
            },
            fields: try wire.fields.map(field(from:)),
            legacyLabels: wire.legacyLabels
        )
    }

    private static func field(from wire: WireCatalogueField) throws -> InventoryFieldDefinition {
        guard let kind = fieldValueKind(wire.kind) else { throw RepositoryError.contractMismatch }
        return InventoryFieldDefinition(
            key: wire.key,
            label: wire.label,
            kind: kind,
            dimension: wire.dimension,
            defaultUnit: wire.unit,
            choices: wire.choices,
            highlighted: wire.highlighted,
            required: wire.required
        )
    }

    private static func fieldValueKind(_ wire: String) -> InventoryFieldValueKind? {
        switch wire {
        case "text": .text
        case "choice": .choice
        case "flag": .flag
        case "measurement": .measurement
        case "range": .range
        case "link": .link
        default: nil
        }
    }
}

/// The subset of `MobileInventoryCatalogueFieldSchema` the mapping above
/// needs, independent of which operation's nominal type produced it.
/// `highlighted`/`required` are already defaulted to `false` by the caller
/// that builds this from the generated (optional) wire fields, which is what
/// keeps this a plain `Bool` here.
internal struct WireCatalogueField {
    internal let key: String
    internal let label: String
    internal let kind: String
    internal let dimension: String?
    internal let unit: String?
    internal let choices: [String]?
    internal let highlighted: Bool
    internal let required: Bool
}

/// The subset of one catalogue type's wire shape the mapping above needs.
internal struct WireCatalogueType {
    internal let key: String
    internal let name: String
    internal let capabilities: [String]
    internal let fields: [WireCatalogueField]
    internal let legacyLabels: [String]
}

/// One row of the unit table, independent of which operation produced it.
internal struct WireCatalogueUnit {
    internal let symbol: String
    internal let dimension: String
    internal let multiplier: Double
}
