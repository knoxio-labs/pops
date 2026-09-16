import Testing

@testable import DesignPlayground

@Suite("Inventory deep link parsing")
internal struct InventoryDeepLinkTests {
    @Test("parses an item URI")
    func parsesItem() {
        #expect(
            InventoryDeepLinkParser.parse("pops://inventory/items/screws") == .item(id: "screws"))
    }

    @Test("parses a container URI")
    func parsesContainer() {
        #expect(
            InventoryDeepLinkParser.parse("pops://inventory/containers/kitchen-12")
                == .container(id: "kitchen-12"))
    }

    @Test("parses a location URI")
    func parsesLocation() {
        #expect(
            InventoryDeepLinkParser.parse("pops://inventory/locations/garage")
                == .location(id: "garage"))
    }

    @Test("a well-formed URI for another pillar is not malformed")
    func recognizesOtherPillars() {
        #expect(
            InventoryDeepLinkParser.parse("pops://finance/transactions/123")
                == .otherPillar(name: "finance"))
    }

    @Test("an unreadable string is malformed")
    func malformedString() {
        #expect(InventoryDeepLinkParser.parse("not a url at all") == .malformed)
    }

    @Test("the wrong scheme is malformed")
    func wrongScheme() {
        #expect(InventoryDeepLinkParser.parse("https://inventory/items/screws") == .malformed)
    }

    @Test("no host is malformed")
    func noHost() {
        #expect(InventoryDeepLinkParser.parse("pops:///items/screws") == .malformed)
    }

    @Test("an inventory URI missing an id is malformed")
    func missingID() {
        #expect(InventoryDeepLinkParser.parse("pops://inventory/items") == .malformed)
    }

    @Test("an inventory URI with an unknown kind is malformed")
    func unknownKind() {
        #expect(InventoryDeepLinkParser.parse("pops://inventory/widgets/screws") == .malformed)
    }
}
