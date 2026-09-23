import AppCore
import Testing

@Suite("Inventory protocol 2 catalogue query")
internal struct InventoryProtocol2QueryTests {
    @Test(
        "reads the exact immutable protocol-2 catalogue without changing the legacy catalogue query"
    )
    func readsProtocol2Catalogue() {
        let snapshot = InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: 7, minimumProtocol: 2), types: [])
        let source = Source(snapshot: snapshot)

        let protocol2Catalogue: InventoryQuery<InventoryCatalogueSnapshot?> = .protocol2Catalogue
        let legacyCatalogue: InventoryQuery<InventoryCatalogue> = .catalogue

        #expect(protocol2Catalogue.read(source) == snapshot)
        #expect(legacyCatalogue.read(source).version == "legacy")
    }

    @Test("protocol-1 sources answer no stable-ID catalogue")
    func protocol1SourceHasNoProtocol2Catalogue() {
        let protocol2Catalogue: InventoryQuery<InventoryCatalogueSnapshot?> = .protocol2Catalogue

        #expect(protocol2Catalogue.read(Protocol1Source()) == nil)
    }

    private struct Source: InventoryQuerySource {
        let snapshot: InventoryCatalogueSnapshot

        func inventoryCatalogue() -> InventoryCatalogue {
            .init(version: "legacy", units: [], types: [])
        }
        func inventoryProtocol2Catalogue() -> InventoryCatalogueSnapshot? { snapshot }
        func inventoryItem(id: String) -> InventoryItem? { nil }
        func inventoryItem(withCode code: String) -> InventoryItem? { nil }
        func inventoryLocation(id: String) -> InventoryLocation? { nil }
        func inventoryLocationTree() -> [InventoryLocation] { [] }
        func inventoryContents(ofLocation locationId: String) -> [InventoryItem] { [] }
        func inventoryContents(ofContainer containerId: String) -> [InventoryItem] { [] }
        func inventoryInHand() -> [InventoryItem] { [] }
        func inventoryOpenContainers() -> [InventoryItem] { [] }
        func inventoryContainers() -> [InventoryItem] { [] }
        func inventoryRecents(limit: Int) -> [InventoryItem] { [] }
        func inventoryRecentEvents(limit: Int) -> [InventoryEvent] { [] }
        func inventoryCounts() -> InventoryCounts { .init(items: 0, containers: 0, locations: 0) }
        func inventoryItems(includeInactive: Bool) -> [InventoryItem] { [] }
        func inventorySearch(text: String, includeInactive: Bool) -> [InventoryItem] { [] }
        func inventoryItemHistory(itemId: String) -> [InventoryEvent] { [] }
        func inventoryLocationHistory(locationId: String) -> [InventoryEvent] { [] }
        func inventorySyncLedger() -> InventoryReplicaSyncLedger { .init() }
        func inventoryReplicaStatus() -> InventoryReplicaStatus { .empty }
        func inventoryPhotoUploads() -> [String: InventoryPhotoUpload] { [:] }
        func inventoryAwaitingTypeArrivals() -> [String] { [] }
    }

    private struct Protocol1Source: InventoryQuerySource {
        func inventoryCatalogue() -> InventoryCatalogue {
            .init(version: "legacy", units: [], types: [])
        }
        func inventoryItem(id: String) -> InventoryItem? { nil }
        func inventoryItem(withCode code: String) -> InventoryItem? { nil }
        func inventoryLocation(id: String) -> InventoryLocation? { nil }
        func inventoryLocationTree() -> [InventoryLocation] { [] }
        func inventoryContents(ofLocation locationId: String) -> [InventoryItem] { [] }
        func inventoryContents(ofContainer containerId: String) -> [InventoryItem] { [] }
        func inventoryInHand() -> [InventoryItem] { [] }
        func inventoryOpenContainers() -> [InventoryItem] { [] }
        func inventoryContainers() -> [InventoryItem] { [] }
        func inventoryRecents(limit: Int) -> [InventoryItem] { [] }
        func inventoryRecentEvents(limit: Int) -> [InventoryEvent] { [] }
        func inventoryCounts() -> InventoryCounts { .init(items: 0, containers: 0, locations: 0) }
        func inventoryItems(includeInactive: Bool) -> [InventoryItem] { [] }
        func inventorySearch(text: String, includeInactive: Bool) -> [InventoryItem] { [] }
        func inventoryItemHistory(itemId: String) -> [InventoryEvent] { [] }
        func inventoryLocationHistory(locationId: String) -> [InventoryEvent] { [] }
        func inventorySyncLedger() -> InventoryReplicaSyncLedger { .init() }
        func inventoryReplicaStatus() -> InventoryReplicaStatus { .empty }
        func inventoryPhotoUploads() -> [String: InventoryPhotoUpload] { [:] }
        func inventoryAwaitingTypeArrivals() -> [String] { [] }
    }
}
