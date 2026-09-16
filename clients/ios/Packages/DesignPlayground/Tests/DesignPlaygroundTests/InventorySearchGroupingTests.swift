import Testing

@testable import DesignPlayground

@Suite("Inventory search grouping")
internal struct InventorySearchGroupingTests {
    private let itemMatch = InventorySearchMatch(
        record: InventorySearchRecord(
            item: InventoryFoundationItem(
                id: "screws", name: "Screws", typeName: "Fastener",
                placement: .direct(location: "Garage"))),
        facets: [.name])

    private let containerMatch = InventorySearchMatch(
        record: InventorySearchRecord(
            item: InventoryFoundationItem(
                id: "box", name: "Kitchen 12", typeName: "Storage box",
                placement: .direct(location: "Kitchen"), access: .open)),
        facets: [.name])

    private let location = InventoryLocationRecord(
        id: "garage", name: "Garage", parentID: nil, itemCount: 4, containerCount: 1)

    private var matches: [InventorySearchMatch] { [itemMatch, containerMatch] }

    @Test("byKind puts a container only in Containers")
    func byKindDoesNotDuplicate() {
        let groups = InventorySearchGrouping.groups(
            for: matches, locations: [location], style: .byKind)
        #expect(groups.map(\.id) == ["items", "containers", "locations"])
        guard case .items(let items) = groups[0] else {
            Issue.record("expected an items group")
            return
        }
        #expect(items.map(\.id) == ["screws"])
    }

    @Test("byKindContainersDuplicated puts a container in both")
    func byKindDuplicatesContainers() {
        let groups = InventorySearchGrouping.groups(
            for: matches, locations: [location], style: .byKindContainersDuplicated)
        guard case .items(let items) = groups[0] else {
            Issue.record("expected an items group")
            return
        }
        #expect(items.map(\.id).sorted() == ["box", "screws"])
    }

    @Test("ranked produces no sections at all")
    func rankedHasNoSections() {
        let groups = InventorySearchGrouping.groups(
            for: matches, locations: [location], style: .ranked)
        #expect(groups.isEmpty)
    }

    @Test("an empty kind is not shown as an empty section")
    func emptyKindsAreOmitted() {
        let groups = InventorySearchGrouping.groups(for: [itemMatch], locations: [], style: .byKind)
        #expect(groups.map(\.id) == ["items"])
    }
}

@Suite("Inventory search filters")
internal struct InventorySearchFilterTests {
    private let openContainer = InventoryFoundationItem(
        id: "box", name: "Box", typeName: "Storage box",
        placement: .direct(location: "Garage"), access: .open)

    private let inHandItem = InventoryFoundationItem(
        id: "passport", name: "Passport", typeName: "Document",
        placement: .inHand(previous: "Drawer"))

    @Test("openContainers matches only an open container")
    func openContainersFilter() {
        #expect(
            InventorySearchFilter.openContainers.matches(InventorySearchRecord(item: openContainer))
        )
        #expect(
            !InventorySearchFilter.openContainers.matches(InventorySearchRecord(item: inHandItem)))
    }

    @Test("inHand matches only an in-hand item")
    func inHandFilter() {
        #expect(InventorySearchFilter.inHand.matches(InventorySearchRecord(item: inHandItem)))
        #expect(!InventorySearchFilter.inHand.matches(InventorySearchRecord(item: openContainer)))
    }

    @Test("missingType matches only an item with no type")
    func missingTypeFilter() {
        let untyped = InventoryFoundationItem(
            id: "bag", name: "Bag", typeName: nil, placement: .direct(location: "Garage"))
        #expect(InventorySearchFilter.missingType.matches(InventorySearchRecord(item: untyped)))
        #expect(
            !InventorySearchFilter.missingType.matches(InventorySearchRecord(item: openContainer)))
    }
}
