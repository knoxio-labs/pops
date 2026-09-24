import AppCore
import GRDB

extension InventoryCatalogueSnapshot {
    /// This revision with the replacement lineage `other` records wherever
    /// this one records none: what a revision stored by an app that
    /// predates lineage becomes once the same revision is fetched again.
    func withLineage(from other: InventoryCatalogueSnapshot) -> InventoryCatalogueSnapshot {
        let types = Dictionary(other.types.map { ($0.id, $0) }) { first, _ in first }
        let fieldPairs = other.types.flatMap(\.fields).map { ($0.id, $0) }
        let fields = Dictionary(fieldPairs) { first, _ in first }
        return InventoryCatalogueSnapshot(
            revision: revision,
            types: self.types.map { type in
                InventoryCatalogueType(
                    id: type.id, key: type.key, label: type.label, description: type.description,
                    sortOrder: type.sortOrder,
                    fields: type.fields.map {
                        $0.replacing(lineage: $0.replacedBy ?? fields[$0.id]?.replacedBy)
                    },
                    capabilities: type.capabilities, legacyLabels: type.legacyLabels,
                    presentation: type.presentation, archivedAt: type.archivedAt,
                    replacedBy: type.replacedBy ?? types[type.id]?.replacedBy)
            })
    }

    /// The live field that stands in for the archived field `id`, following
    /// recorded lineage to its live end; nil when there is none.
    func replacingField(_ id: String) -> InventoryCatalogueField? {
        let fields = Dictionary(types.flatMap(\.fields).map { ($0.id, $0) }) { first, _ in first }
        return Self.liveEnd(of: id, in: fields, archivedAt: \.archivedAt, replacedBy: \.replacedBy)
    }

    /// ``replacingField(_:)`` for an archived type.
    func replacingType(_ id: String) -> InventoryCatalogueType? {
        let types = Dictionary(self.types.map { ($0.id, $0) }) { first, _ in first }
        return Self.liveEnd(of: id, in: types, archivedAt: \.archivedAt, replacedBy: \.replacedBy)
    }

    /// Mirrors `liveEnd` in the inventory pillar's `catalogue-replacements.ts`.
    private static func liveEnd<Definition>(
        of id: String, in definitions: [String: Definition],
        archivedAt: (Definition) -> String?, replacedBy: (Definition) -> String?
    ) -> Definition? {
        guard var current = definitions[id] else { return nil }
        var seen: Set<String> = [id]
        var currentId = id
        while archivedAt(current) != nil, let next = replacedBy(current) {
            guard seen.insert(next).inserted, let found = definitions[next] else { return nil }
            current = found
            currentId = next
        }
        return currentId != id && archivedAt(current) == nil ? current : nil
    }
}

extension InventoryCatalogueField {
    fileprivate func replacing(lineage: String?) -> InventoryCatalogueField {
        InventoryCatalogueField(
            id: id, typeId: typeId, key: key, label: label, help: help, sortOrder: sortOrder,
            kind: kind, cardinality: cardinality, required: required, storage: storage,
            fixedUnit: fixedUnit, references: references, expressionVersion: expressionVersion,
            expression: expression, allowOverride: allowOverride, presentation: presentation,
            archivedAt: archivedAt, replacedBy: lineage, enumOptions: enumOptions)
    }
}

internal enum CatalogueLineageRows {
    /// Records on `stored`'s rows the lineage `incoming`, the same revision
    /// fetched again, carries where `stored` has none.
    static func fill(
        _ stored: InventoryCatalogueSnapshot, from incoming: InventoryCatalogueSnapshot,
        in db: Database
    ) throws {
        let revision = stored.revision.revision
        let storedTypes = Dictionary(stored.types.map { ($0.id, $0) }) { first, _ in first }
        let fieldPairs = stored.types.flatMap(\.fields).map { ($0.id, $0) }
        let storedFields = Dictionary(fieldPairs) { first, _ in first }
        for type in incoming.types {
            if let lineage = type.replacedBy, storedTypes[type.id]?.replacedBy == nil {
                try record(lineage, on: "catalogue_type", id: type.id, revision: revision, in: db)
            }
            for field in type.fields {
                if let lineage = field.replacedBy, storedFields[field.id]?.replacedBy == nil {
                    try record(
                        lineage, on: "catalogue_field", id: field.id, revision: revision, in: db)
                }
            }
        }
    }

    private static func record(
        _ lineage: String, on table: String, id: String, revision: Int, in db: Database
    ) throws {
        try db.execute(
            sql: "UPDATE \(table) SET replaced_by = ? WHERE revision = ? AND id = ?",
            arguments: [lineage, revision, id])
    }
}
