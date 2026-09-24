import AppCore
import GRDB

/// What search indexes an item against: the catalogue that names its type,
/// and, with a protocol-2 revision in use, the labels its enum values show.
internal struct SearchCatalogue {
    private struct OptionKey: Hashable {
        let fieldId: String
        let optionId: String
    }

    /// The catalogue an item's type label is looked up in.
    let types: InventoryCatalogue?
    private let optionLabels: [OptionKey: String]

    init(types: InventoryCatalogue?) {
        self.types = types
        optionLabels = [:]
    }

    init(_ snapshot: InventoryCatalogueSnapshot) {
        types = InventoryCatalogue(
            version: "protocol2-\(snapshot.revision.revision)", units: [],
            types: snapshot.types.map {
                InventoryType(
                    key: $0.key, name: $0.label,
                    capabilities: $0.capabilities.compactMap {
                        $0 == "containment" ? .containment : nil
                    },
                    fields: [], legacyLabels: $0.legacyLabels)
            })
        var labels: [OptionKey: String] = [:]
        for field in snapshot.types.flatMap(\.fields) {
            for option in field.enumOptions {
                labels[OptionKey(fieldId: field.id, optionId: option.id)] = option.label
            }
        }
        optionLabels = labels
    }

    /// The stored protocol-2 revision when one is in use, since `catalogue`
    /// (protocol 1) is never written alongside it, falling back to the
    /// legacy protocol-1 catalogue otherwise.
    static func read(_ meta: SyncMeta, in db: Database) throws -> SearchCatalogue {
        if let revision = meta.catalogueRevision,
            let snapshot = try Protocol2CatalogueRows.read(revision: revision, in: db)
        {
            return SearchCatalogue(snapshot)
        }
        return SearchCatalogue(types: try meta.storedCatalogue())
    }

    static func read(in db: Database) throws -> SearchCatalogue {
        try read(try SyncMeta.read(db), in: db)
    }

    func optionLabel(fieldId: String, optionId: String) -> String? {
        optionLabels[OptionKey(fieldId: fieldId, optionId: optionId)]
    }
}

internal enum Protocol2SearchIndex {
    static func reindex(_ catalogue: InventoryCatalogueSnapshot, in db: Database) throws {
        try ReplicaSearchIndex.reindexAll(catalogue: SearchCatalogue(catalogue), in: db)
    }
}
