import Testing

@testable import DesignPlayground

@Suite("Inventory search engine")
internal struct InventorySearchEngineTests {
    private let cable = InventorySearchRecord(
        item: InventoryFoundationItem(
            id: "cable", name: "USB-C cable", typeName: "Cable", code: "C001",
            placement: .contained(location: "Study", containers: ["Desk drawer"])),
        externalIdentifier: "Anker A8163", note: "Braided, slightly frayed at one end")

    private let box = InventorySearchRecord(
        item: InventoryFoundationItem(
            id: "box", name: "Kitchen 12", typeName: "Storage box",
            placement: .direct(location: "Kitchen"), access: .open),
        capabilities: ["Can hold other items"])

    private var records: [InventorySearchRecord] { [cable, box] }

    @Test("an empty query matches nothing")
    func emptyQueryMatchesNothing() {
        #expect(InventorySearchEngine.search("", in: records).isEmpty)
        #expect(InventorySearchEngine.search("   ", in: records).isEmpty)
    }

    @Test("a query with no match returns nothing")
    func noMatch() {
        #expect(InventorySearchEngine.search("xylophone", in: records).isEmpty)
    }

    @Test("matches by name")
    func matchesByName() {
        let matches = InventorySearchEngine.search("usb-c", in: records)
        #expect(matches.map(\.id) == ["cable"])
        #expect(matches[0].facets.contains(.name))
    }

    @Test("matches by inventory code")
    func matchesByInventoryCode() {
        let matches = InventorySearchEngine.search("c001", in: records)
        #expect(matches.map(\.id) == ["cable"])
        #expect(matches[0].facets == [.inventoryCode])
    }

    @Test("matches by external identifier")
    func matchesByExternalIdentifier() {
        let matches = InventorySearchEngine.search("anker", in: records)
        #expect(matches[0].facets == [.externalIdentifier])
    }

    @Test("matches by note")
    func matchesByNote() {
        let matches = InventorySearchEngine.search("frayed", in: records)
        #expect(matches[0].facets == [.note])
    }

    @Test("matches by type")
    func matchesByType() {
        let matches = InventorySearchEngine.search("storage", in: records)
        #expect(matches.map(\.id) == ["box"])
        #expect(matches[0].facets == [.typeName])
    }

    @Test("matches by capability")
    func matchesByCapability() {
        let matches = InventorySearchEngine.search("hold other", in: records)
        #expect(matches.map(\.id) == ["box"])
        #expect(matches[0].facets == [.capability])
    }

    @Test("matches by placement")
    func matchesByPlacement() {
        let matches = InventorySearchEngine.search("desk drawer", in: records)
        #expect(matches.map(\.id) == ["cable"])
        #expect(matches[0].facets == [.placement])
    }

    @Test("a query matching several facets on one record reports all of them")
    func matchesSeveralFacets() {
        let mixed = InventorySearchRecord(
            item: InventoryFoundationItem(
                id: "mixed", name: "Study lamp", typeName: "Study fixture",
                placement: .direct(location: "Study")))
        let matches = InventorySearchEngine.search("study", in: [mixed])
        #expect(matches[0].facets.sorted { "\($0)" < "\($1)" }.count == 3)
        #expect(matches[0].facets.contains(.name))
        #expect(matches[0].facets.contains(.typeName))
        #expect(matches[0].facets.contains(.placement))
    }
}
