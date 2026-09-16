import Testing

@testable import DesignPlayground

/// What the queue promises: your changes replay in the order you made them,
/// except where that order is impossible, and nothing ever disappears.
///
/// The second half is the one worth guarding. A topological sort written
/// casually drops the operations it cannot place, and the symptom, an item
/// that is simply not in the list any more, looks exactly like a screen that
/// filtered it on purpose.
@Suite("Inventory queue")
internal struct InventoryQueueTests {
    private func operation(
        _ id: String, enqueued: Int, dependsOn: String? = nil
    ) -> InventoryQueuedOperation {
        InventoryQueuedOperation(
            id: id, verb: "Moved", subject: id, detail: "", enqueued: enqueued,
            dependsOn: dependsOn)
    }

    @Test("with nothing depending on anything, enqueue order is kept")
    func fifoIsTheDefault() {
        let ordered = InventoryQueue.ordered([
            operation("c", enqueued: 3), operation("a", enqueued: 1), operation("b", enqueued: 2),
        ])

        #expect(ordered.map(\.id) == ["a", "b", "c"])
    }

    @Test("an operation never precedes the one it depends on")
    func dependencyBeatsTheClock() {
        let ordered = InventoryQueue.ordered([
            operation("move", enqueued: 1, dependsOn: "create"),
            operation("create", enqueued: 2),
            operation("count", enqueued: 3),
        ])

        #expect(ordered.map(\.id) == ["create", "move", "count"])
    }

    @Test("the packing fixture replays the crate before the move into it")
    func fixtureOrdersTheCrateFirst() {
        let ordered = InventoryQueue.ordered(InventorySyncFixtures.queued).map(\.id)
        let crate = ordered.firstIndex(of: "create-crate")
        let move = ordered.firstIndex(of: "move-espresso")

        #expect(crate != nil)
        #expect(move != nil)
        #expect(crate.flatMap { first in move.map { first < $0 } } == true)
    }

    @Test("an operation whose dependency is not in the queue is still replayed")
    func absentDependencyDoesNotDropTheOperation() {
        let ordered = InventoryQueue.ordered([
            operation("orphan", enqueued: 1, dependsOn: "never-queued"),
            operation("other", enqueued: 2),
        ])

        #expect(Set(ordered.map(\.id)) == ["orphan", "other"])
    }

    @Test("a dependency cycle neither hangs nor loses an operation")
    func cycleIsSurvivable() {
        let ordered = InventoryQueue.ordered([
            operation("one", enqueued: 1, dependsOn: "two"),
            operation("two", enqueued: 2, dependsOn: "one"),
            operation("free", enqueued: 3),
        ])

        #expect(ordered.count == 3)
        #expect(Set(ordered.map(\.id)) == ["one", "two", "free"])
    }

    @Test("a failure holds everything behind it, however far behind")
    func holdsAreTransitive() {
        let held = InventoryQueue.held(
            by: "create",
            in: [
                operation("create", enqueued: 1),
                operation("move", enqueued: 2, dependsOn: "create"),
                operation("close", enqueued: 3, dependsOn: "move"),
                operation("unrelated", enqueued: 4),
            ])

        #expect(held.map(\.id) == ["move", "close"])
    }

    @Test("the failed operation is not listed among what it holds")
    func holdsExcludeTheCause() {
        let held = InventoryQueue.held(by: "create-crate", in: InventorySyncFixtures.queued)

        #expect(!held.contains { $0.id == "create-crate" })
        #expect(held.map(\.id) == ["move-espresso"])
    }

    @Test("staged photos are counted from what has not landed")
    func stagedPhotosExcludeWhatLanded() {
        #expect(InventoryQueue.stagedPhotoCount(in: InventorySyncFixtures.queued) == 6)
        #expect(InventoryQueue.stagedPhotoCount(in: InventorySyncFixtures.replaying) == 5)
    }
}
