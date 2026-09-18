import Testing

@testable import DesignPlayground

private func profile(
    _ id: String, _ name: String, code: String? = nil, location: String = "Garage"
) -> InventoryContainerProfile {
    InventoryContainerProfile(
        detail: InventoryItemDetail(
            item: InventoryFoundationItem(
                id: id, name: name, typeName: "Storage box", code: code,
                placement: .direct(location: location), access: .open)))
}

/// What the containers browser's search narrows to: name, code or location.
@Suite("Inventory container search matching")
internal struct InventoryContainerSearchMatchingTests {
    private let kitchen = profile("kitchen-12", "Kitchen 12", code: "B412", location: "Kitchen")
    private let office = profile("office-04", "Office 04", code: "B404", location: "Study")

    private var profiles: [InventoryContainerProfile] { [kitchen, office] }

    @Test("matches by name")
    func matchesByName() {
        #expect(InventoryContainerSearchMatching.matches("kitchen", profile: kitchen))
        #expect(!InventoryContainerSearchMatching.matches("kitchen", profile: office))
    }

    @Test("matches by inventory code, case-insensitively")
    func matchesByCode() {
        #expect(InventoryContainerSearchMatching.matches("b412", profile: kitchen))
    }

    @Test("matches by location")
    func matchesByLocation() {
        #expect(InventoryContainerSearchMatching.matches("study", profile: office))
        #expect(!InventoryContainerSearchMatching.matches("study", profile: kitchen))
    }

    @Test("a query with no match returns nothing")
    func noMatch() {
        #expect(InventoryContainerSearchMatching.matching("xylophone", in: profiles).isEmpty)
    }

    @Test("an empty or whitespace-only query keeps every container")
    func emptyQueryKeepsEverything() {
        let ids = profiles.map(\.id)
        #expect(InventoryContainerSearchMatching.matching("", in: profiles).map(\.id) == ids)
        #expect(InventoryContainerSearchMatching.matching("   ", in: profiles).map(\.id) == ids)
    }
}
