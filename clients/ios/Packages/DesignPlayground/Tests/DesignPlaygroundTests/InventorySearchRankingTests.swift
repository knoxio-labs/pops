import Testing

@testable import DesignPlayground

@Suite("Inventory search ranking")
internal struct InventorySearchRankingTests {
    private func match(_ id: String, _ name: String, facets: [InventorySearchFacet] = [.name])
        -> InventorySearchMatch
    {
        InventorySearchMatch(
            record: InventorySearchRecord(
                item: InventoryFoundationItem(
                    id: id, name: name, typeName: "Thing", placement: .direct(location: "Hall"))),
            facets: facets)
    }

    @Test("a name starting with the query outranks one containing it, which outranks other fields")
    func tiers() {
        let byPlacement = match("a", "Drill", facets: [.placement])
        let containing = match("b", "Big garage box")
        let prefix = match("c", "Garage key")
        let hits = InventorySearchRanking.rank(
            "gar", matches: [byPlacement, containing, prefix], places: [])
        #expect(hits.map(\.id) == ["record-c", "record-b", "record-a"])
    }

    @Test("places interleave by the same rule and ties keep arrival order")
    func placesAndTies() {
        let garage = InventoryLocationNode(id: "garage", name: "Garage")
        let first = match("a", "Gardening gloves")
        let hits = InventorySearchRanking.rank("gar", matches: [first], places: [garage])
        #expect(hits.map(\.id) == ["record-a", "place-garage"])
    }

    @Test("a code match is flagged for the badge, a name match is not")
    func codeFlag() {
        #expect(InventorySearchHit.record(match("a", "Box", facets: [.inventoryCode])).matchedCode)
        #expect(!InventorySearchHit.record(match("a", "Box")).matchedCode)
        #expect(!InventorySearchHit.place(InventoryLocationNode(id: "p", name: "P")).matchedCode)
    }

    @Test("highlights every case-insensitive occurrence and nothing for a blank query")
    func highlights() {
        let text = "Garage garage"
        let ranges = InventorySearchRanking.highlights(of: "GAR", in: text)
        #expect(ranges.map { String(text[$0]) } == ["Gar", "gar"])
        #expect(InventorySearchRanking.highlights(of: "  ", in: text).isEmpty)
        #expect(InventorySearchRanking.highlights(of: "xyz", in: text).isEmpty)
    }
}

@Suite("Inventory search filter")
internal struct InventorySearchFilterTests {
    private func record(
        _ placement: InventoryPlacement = .direct(location: "Hall"),
        typeName: String? = "Tool", code: String? = nil, quantity: Int = 1,
        access: InventoryAccess? = nil, lifecycle: InventoryLifecycle = .active,
        sync: InventorySync = .synchronized
    ) -> InventorySearchRecord {
        InventorySearchRecord(
            item: InventoryFoundationItem(
                id: "x", name: "X", typeName: typeName, code: code, quantity: quantity,
                placement: placement, access: access, lifecycle: lifecycle, sync: sync))
    }

    @Test("the default filter is inactive and hides only inactive records")
    func defaults() {
        let filter = InventorySearchFilter()
        #expect(!filter.isActive)
        #expect(filter.matches(record()))
        for lifecycle in InventoryLifecycle.allCases where lifecycle != .active {
            #expect(!filter.matches(record(lifecycle: lifecycle)))
        }
    }

    @Test("include inactive lets inactive records through and counts as active")
    func includeInactive() {
        let filter = InventorySearchFilter(includesInactive: true)
        #expect(filter.isActive)
        #expect(filter.matches(record(lifecycle: .lost)))
    }

    @Test("placement narrows to its own case only")
    func placement() {
        let filter = InventorySearchFilter(placement: .inHand)
        #expect(filter.matches(record(.inHand(previous: nil))))
        #expect(!filter.matches(record(.contained(location: "Hall", containers: ["Box"]))))
    }

    @Test("closed takes sealed containers, and neither takes a plain item")
    func containerState() {
        let closed = InventorySearchFilter(containerState: .closed)
        #expect(closed.matches(record(access: .sealed)))
        #expect(!closed.matches(record(access: .open)))
        #expect(!closed.matches(record()))
    }

    @Test("quantity, missing and sync each narrow independently and all must hold")
    func combined() {
        let filter = InventorySearchFilter(quantity: .noneLeft, missing: .code, sync: .stale)
        #expect(filter.matches(record(quantity: 0, sync: .stale)))
        #expect(!filter.matches(record(code: "C1", quantity: 0, sync: .stale)))
        #expect(!filter.matches(record(quantity: 2, sync: .stale)))
        #expect(!filter.matches(record(quantity: 0)))
    }

    @Test("type matches the exact type name and missing type matches untyped")
    func type() {
        #expect(InventorySearchFilter(typeName: "Tool").matches(record()))
        #expect(!InventorySearchFilter(typeName: "Cable").matches(record()))
        #expect(InventorySearchFilter(missing: .type).matches(record(typeName: nil)))
        #expect(!InventorySearchFilter(missing: .type).matches(record()))
    }

    @Test("the summary names only what is set")
    func summary() {
        #expect(InventorySearchFilter().summary.isEmpty)
        #expect(
            InventorySearchFilter(placement: .inHand, includesInactive: true).summary
                == "In hand, Including inactive")
    }
}

@Suite("Inventory scan routing and item sections")
internal struct InventoryScanRoutingTests {
    private let screws = InventorySearchRecord(
        item: InventoryFoundationItem(
            id: "screws", name: "Screws", typeName: nil, placement: .direct(location: "Hall")))
    private let box = InventorySearchRecord(
        item: InventoryFoundationItem(
            id: "box", name: "Box", typeName: nil, placement: .direct(location: "Hall"),
            access: .open))
    private let tree = InventoryLocationTree(nodes: [
        InventoryLocationNode(id: "garage", name: "Garage")
    ])

    private func phase(_ raw: String) -> InventoryScanPhase {
        InventoryScanRouting.phase(for: raw, records: [screws, box], places: tree)
    }

    @Test("routes each Inventory kind to what it names")
    func found() {
        #expect(phase("pops://inventory/items/screws") == .found(.record(screws)))
        #expect(phase("pops://inventory/containers/box") == .found(.record(box)))
        #expect(phase("pops://inventory/locations/garage") == .found(.place(tree.nodes[0])))
    }

    @Test("a code whose kind does not match the record is missing, not found")
    func kindMismatch() {
        #expect(phase("pops://inventory/items/box") == .targetMissing)
        #expect(phase("pops://inventory/containers/screws") == .targetMissing)
        #expect(phase("pops://inventory/locations/attic") == .targetMissing)
    }

    @Test("another pillar hands off by name, anything else is not a POPS code")
    func otherCodes() {
        #expect(phase("pops://purchases/orders/1") == .unsupported(pillar: "Purchases"))
        #expect(phase("https://example.com") == .notPops)
        #expect(phase("pops://inventory/shelves/1") == .notPops)
    }

    @Test("recent sections split at a week and drop an empty one")
    func recentSections() {
        let new = InventorySearchRecord(item: screws.item, addedDaysAgo: 7)
        let old = InventorySearchRecord(item: box.item, addedDaysAgo: 8)
        #expect(
            InventoryItemSection.sections([new, old], by: .recent).map(\.title)
                == ["This week", "Earlier"])
        #expect(InventoryItemSection.sections([old], by: .recent).map(\.title) == ["Earlier"])
    }

    @Test("name sections group by initial in arrival order")
    func nameSections() {
        let sections = InventoryItemSection.sections([box, screws], by: .name)
        #expect(sections.map(\.title) == ["B", "S"])
        #expect(sections.map { $0.records.count } == [1, 1])
    }
}
