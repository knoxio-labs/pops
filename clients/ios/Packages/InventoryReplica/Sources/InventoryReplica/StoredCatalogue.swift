import AppCore

/// The catalogue as `sync_meta.catalogue` keeps it. The value kinds and
/// capabilities are closed in `AppCore` (D5), so a stored one this build cannot
/// name is corruption rather than a newer server's vocabulary: the catalogue
/// only reaches this table after the transport decoded it.
internal struct StoredCatalogue: Codable {
    struct Unit: Codable {
        let key: String
        let dimension: String
        let multiplierToBase: Double
    }

    struct Field: Codable {
        let key: String
        let label: String
        let kind: String
        let dimension: String?
        let defaultUnit: String?
        let choices: [String]?
        let highlighted: Bool
        let required: Bool
    }

    struct TypeEntry: Codable {
        let key: String
        let name: String
        let capabilities: [String]
        let fields: [Field]
        let legacyLabels: [String]
    }

    let version: String
    let units: [Unit]
    let types: [TypeEntry]

    init(_ catalogue: InventoryCatalogue) {
        version = catalogue.version
        units = catalogue.units.map {
            Unit(key: $0.key, dimension: $0.dimension, multiplierToBase: $0.multiplierToBase)
        }
        types = catalogue.types.map { type in
            TypeEntry(
                key: type.key, name: type.name,
                capabilities: type.capabilities.map(Self.storageValue),
                fields: type.fields.map(Field.init), legacyLabels: type.legacyLabels)
        }
    }

    func domainValue() throws -> InventoryCatalogue {
        InventoryCatalogue(
            version: version,
            units: units.map {
                InventoryUnit(
                    key: $0.key, dimension: $0.dimension, multiplierToBase: $0.multiplierToBase)
            },
            types: try types.map { entry in
                InventoryType(
                    key: entry.key, name: entry.name,
                    capabilities: try entry.capabilities.map(Self.capability),
                    fields: try entry.fields.map { try $0.domainValue() },
                    legacyLabels: entry.legacyLabels)
            })
    }

    private static func storageValue(of capability: InventoryCapability) -> String {
        switch capability {
        case .containment: "containment"
        }
    }

    private static func capability(_ stored: String) throws -> InventoryCapability {
        guard stored == "containment" else {
            throw InventoryReplicaError.corruptValue("capability \(stored)")
        }
        return .containment
    }
}

extension StoredCatalogue.Field {
    init(_ field: InventoryFieldDefinition) {
        self.init(
            key: field.key, label: field.label, kind: Self.storageValue(of: field.kind),
            dimension: field.dimension, defaultUnit: field.defaultUnit, choices: field.choices,
            highlighted: field.highlighted, required: field.required)
    }

    func domainValue() throws -> InventoryFieldDefinition {
        guard let valueKind = Self.valueKinds[kind] else {
            throw InventoryReplicaError.corruptValue("value kind \(kind)")
        }
        return InventoryFieldDefinition(
            key: key, label: label, kind: valueKind, dimension: dimension,
            defaultUnit: defaultUnit, choices: choices, highlighted: highlighted, required: required
        )
    }

    private static let valueKinds: [String: InventoryFieldValueKind] = [
        "text": .text, "choice": .choice, "flag": .flag, "measurement": .measurement,
        "range": .range, "link": .link,
    ]

    private static func storageValue(of kind: InventoryFieldValueKind) -> String {
        switch kind {
        case .text: "text"
        case .choice: "choice"
        case .flag: "flag"
        case .measurement: "measurement"
        case .range: "range"
        case .link: "link"
        }
    }
}
