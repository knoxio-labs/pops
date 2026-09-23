import AppCore
import GRDB

internal enum Protocol2SearchIndex {
    static func reindex(_ catalogue: InventoryCatalogueSnapshot, in db: Database) throws {
        try ReplicaSearchIndex.reindexAll(catalogue: searchableCatalogue(catalogue), in: db)
    }

    static func searchableCatalogue(_ catalogue: InventoryCatalogueSnapshot)
        -> InventoryCatalogue
    {
        InventoryCatalogue(
            version: "protocol2-\(catalogue.revision.revision)", units: [],
            types: catalogue.types.map {
                InventoryType(
                    key: $0.key, name: $0.label,
                    capabilities: $0.capabilities.compactMap {
                        $0 == "containment" ? .containment : nil
                    },
                    fields: [], legacyLabels: $0.legacyLabels)
            })
    }
}
