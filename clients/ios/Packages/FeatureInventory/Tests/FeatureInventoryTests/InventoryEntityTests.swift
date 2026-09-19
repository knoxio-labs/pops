import AppCore
import Testing

@testable import FeatureInventory

@Suite("Inventory entity references")
internal struct InventoryEntityTests {
    private typealias Fixture = InventoryFixture

    @Test("an item and a location reference each resolve to their record")
    func parsesTheTwoTypes() {
        #expect(
            InventoryEntity(PopsURI(pillar: "inventory", type: "item", id: "tv")) == .item("tv"))
        #expect(
            InventoryEntity(PopsURI(pillar: "inventory", type: "location", id: "kitchen"))
                == .location("kitchen"))
    }

    @Test("another pillar's reference, or a type with no screen, is not this feature's")
    func refusesWhatItCannotShow() {
        #expect(InventoryEntity(PopsURI(pillar: "purchases", type: "item", id: "tv")) == nil)
        #expect(InventoryEntity(PopsURI(pillar: "inventory", type: "container", id: "b1")) == nil)
    }

    @Test("every registered type parses, so a registration never routes to nothing")
    func registeredTypesAllParse() {
        for type in InventoryEntity.types {
            #expect(
                InventoryEntity(PopsURI(pillar: InventoryEntity.pillar, type: type, id: "x")) != nil
            )
        }
    }

    @Test("an item opens item detail, a container its page, and a place the place's page")
    func routes() {
        let tv = Fixture.item("tv", "Television", at: .location("living"))
        let box = Fixture.item("box", "Box", at: .location("living"), access: .open)

        #expect(InventoryEntity.item("tv").route(resolving: tv) == .item("tv"))
        #expect(InventoryEntity.item("box").route(resolving: box) == .container("box"))
        #expect(InventoryEntity.item("gone").route(resolving: nil) == .item("gone"))
        #expect(InventoryEntity.location("living").route(resolving: nil) == .place("living"))
    }
}
