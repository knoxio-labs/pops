import Testing

@testable import DesignPlayground

/// What the queue counts, and what it must not.
///
/// The count is the whole claim the queue makes, so the three things that are
/// untyped without waiting, a discarded one, a kept one, and one that has since
/// gained a type, each get a test. A queue that counted them would tell
/// somebody there is work that a deploy cannot clear.
@Suite("Waiting for a type")
internal struct InventoryWaitingQueueTests {
    private typealias Fixtures = InventoryUntypedFixtures

    private func ids(_ items: [InventoryUntypedItem]) -> [String] { items.map(\.id) }

    @Test("the queue counts the untyped, active items nobody has answered")
    func countsWhatIsWaiting() {
        #expect(InventoryWaitingQueue.waiting(in: Fixtures.all).count == 11)
        #expect(InventoryWaitingQueue.summary(for: Fixtures.all) == "11 things waiting for a type")
    }

    @Test("an item kept untyped on purpose is not waiting")
    func keptIsNotWaiting() {
        #expect(!ids(InventoryWaitingQueue.waiting(in: Fixtures.all)).contains("sextant"))
        #expect(ids(InventoryWaitingQueue.kept(in: Fixtures.all)) == ["sextant"])
    }

    @Test("a discarded item is in neither list, because it has stopped counting")
    func discardedIsInNeitherList() {
        #expect(!ids(InventoryWaitingQueue.waiting(in: Fixtures.all)).contains("airer"))
        #expect(!ids(InventoryWaitingQueue.kept(in: Fixtures.all)).contains("airer"))
    }

    @Test("gaining a type takes an item out of the queue")
    func typedItemLeaves() {
        let typed = InventoryUntypedItem(
            item: InventoryFoundationItem(
                id: "duffel", name: "Duffel bag", typeName: "Bag",
                placement: .direct(location: "Study")),
            note: "", filed: "Today")

        #expect(InventoryWaitingQueue.waiting(in: [typed]).isEmpty)
    }

    @Test("the summary says what it is counting, and is singular at one")
    func summaryIsGrammatical() {
        #expect(InventoryWaitingQueue.summary(for: []) == "Nothing waiting for a type")
        #expect(
            InventoryWaitingQueue.summary(for: [Fixtures.canvasBag])
                == "1 thing waiting for a type")
    }

    @Test("a queue holding only answered items reads as empty rather than as one")
    func keptOnlyIsAnEmptyQueue() {
        let kept = [Fixtures.sextant]

        #expect(InventoryWaitingQueue.waiting(in: kept).isEmpty)
        #expect(InventoryWaitingQueue.summary(for: kept) == "Nothing waiting for a type")
        #expect(InventoryWaitingQueue.kept(in: kept).count == 1)
    }

    @Test("accepting a type in a batch leaves the rest waiting")
    func remainingAfterAReview() {
        let remaining = InventoryWaitingQueue.remaining(
            in: Fixtures.all, accepted: ["untyped", "sleeping-bag"])

        #expect(remaining.count == 9)
        #expect(!ids(remaining).contains("untyped"))
        #expect(ids(remaining).contains("tripod"), "a skipped match stays waiting")
    }

    @Test("accepting nothing leaves the queue exactly as it was")
    func remainingWithNoAcceptances() {
        #expect(InventoryWaitingQueue.remaining(in: Fixtures.all, accepted: []).count == 11)
    }
}
