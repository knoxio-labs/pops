import Testing

@testable import DesignPlayground

/// Which waiting items a newly shipped type covers.
///
/// The rule reads words out of a name and a note, which is all an untyped item
/// has, so its failure mode is claiming something it should not: a Table type
/// taking a tablecloth, or a type being offered for an item somebody already
/// said would never share a shape. Both are here.
@Suite("Type arrival")
internal struct InventoryTypeArrivalTests {
    private typealias Fixtures = InventoryUntypedFixtures
    private let bag = Fixtures.bagType

    private func ids(_ items: [InventoryUntypedItem]) -> [String] { items.map(\.id) }

    @Test("a type covers the items whose name carries one of its words")
    func matchesOnName() {
        let covered = ids(InventoryTypeArrival.covered(by: bag, in: Fixtures.all))

        #expect(covered.contains("untyped"))
        #expect(covered.contains("sleeping-bag"))
    }

    @Test("an item is matched through its note when its name says nothing")
    func matchesOnNote() {
        let covered = ids(InventoryTypeArrival.covered(by: bag, in: Fixtures.all))

        #expect(covered.contains("tripod"), "the tripod is in a padded case")
    }

    @Test("a word is matched whole, so a Table type does not take a tablecloth")
    func doesNotMatchInsideALongerWord() {
        let table = InventoryItemType(
            id: "table", name: "Table", fieldNames: ["Seats"], terms: ["table", "desk"],
            arrivedIn: "2.4")

        #expect(InventoryTypeArrival.covered(by: table, in: Fixtures.all).isEmpty)
        #expect(!InventoryTypeArrival.matches(table, Fixtures.tablecloth))
    }

    @Test("matching ignores case and punctuation around a word")
    func matchingIsCaseInsensitive() {
        let shouting = InventoryItemType(
            id: "mat", name: "Mat", fieldNames: [], terms: ["YOGA"], arrivedIn: "2.4")

        #expect(ids(InventoryTypeArrival.covered(by: shouting, in: Fixtures.all)) == ["yoga-mat"])
    }

    @Test("an item kept untyped on purpose is never offered a type, even a matching one")
    func keptUntypedIsNotOffered() {
        let box = Fixtures.boxChange.type

        #expect(InventoryTypeArrival.matches(box, Fixtures.sextant), "its note says box")
        #expect(!ids(InventoryTypeArrival.covered(by: box, in: Fixtures.all)).contains("sextant"))
    }

    @Test("a discarded item has stopped counting, so it is not offered either")
    func discardedIsNotOffered() {
        let airer = InventoryItemType(
            id: "airer", name: "Airer", fieldNames: [], terms: ["airer"], arrivedIn: "2.4")

        #expect(InventoryTypeArrival.matches(airer, Fixtures.airer))
        #expect(InventoryTypeArrival.covered(by: airer, in: Fixtures.all).isEmpty)
    }

    @Test("an item that already has a type has left, whatever its words say")
    func typedItemsAreNotOffered() {
        let typed = InventoryUntypedItem(
            item: InventoryFoundationItem(
                id: "duffel", name: "Duffel bag", typeName: "Bag",
                placement: .direct(location: "Study")),
            note: "A bag.", filed: "Today")

        #expect(InventoryTypeArrival.matches(bag, typed))
        #expect(InventoryTypeArrival.covered(by: bag, in: [typed]).isEmpty)
    }

    @Test("a type whose words match nothing covers nothing, and says so")
    func noMatchesAtAll() {
        let vehicle = InventoryItemType(
            id: "vehicle", name: "Vehicle", fieldNames: [], terms: ["bicycle", "car"],
            arrivedIn: "2.4")

        #expect(InventoryTypeArrival.covered(by: vehicle, in: Fixtures.all).isEmpty)
        #expect(
            InventoryTypeArrival.summary(covered: 0, waiting: 11)
                == "Nothing waiting looks like one")
    }

    @Test("an item matched by two of a type's words is offered once")
    func aMatchIsNotCountedTwice() {
        let twice = InventoryItemType(
            id: "twice", name: "Twice", fieldNames: [], terms: ["sleeping", "bag"],
            arrivedIn: "2.4")

        #expect(ids(InventoryTypeArrival.covered(by: twice, in: [Fixtures.sleepingBag])).count == 1)
    }

    @Test("the summary counts the matches against what is waiting, in words")
    func summaryReadsAsASentence() {
        #expect(
            InventoryTypeArrival.summary(covered: 1, waiting: 11)
                == "1 of the 11 waiting look like one")
        #expect(
            InventoryTypeArrival.summary(covered: 3, waiting: 11)
                == "3 of the 11 waiting look like one")
    }
}
