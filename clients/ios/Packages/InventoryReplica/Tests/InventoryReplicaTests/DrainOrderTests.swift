import Testing

@testable import InventoryReplica

@Suite("Drain order and backoff")
internal struct DrainOrderTests {
    private struct Operation {
        let id: String
        var dependsOn: [String] = []
    }

    private static func ordered(_ operations: [Operation]) -> [String] {
        DrainOrder.ordered(operations, id: \.id, dependsOn: \.dependsOn).map(\.id)
    }

    @Test("with no dependencies the enqueue order stands")
    func enqueueOrderStands() {
        #expect(
            Self.ordered([Operation(id: "a"), Operation(id: "b"), Operation(id: "c")]) == [
                "a", "b", "c",
            ])
    }

    @Test("the playground's queue: a move logged before its crate's create goes after it")
    func dependencyBeatsTheClock() {
        let ordered = Self.ordered([
            Operation(id: "move", dependsOn: ["create"]), Operation(id: "create"),
            Operation(id: "count"),
        ])

        #expect(ordered == ["create", "move", "count"])
    }

    @Test("a released dependent goes before later operations it was enqueued ahead of")
    func releasedDependentKeepsItsPlace() {
        let ordered = Self.ordered([
            Operation(id: "a", dependsOn: ["c"]), Operation(id: "b", dependsOn: ["c"]),
            Operation(id: "c"), Operation(id: "d"),
        ])

        #expect(ordered == ["c", "a", "b", "d"])
    }

    @Test("an operation waits for every one of its dependencies")
    func waitsForAllDependencies() {
        let ordered = Self.ordered([
            Operation(id: "both", dependsOn: ["x", "y"]), Operation(id: "x"),
            Operation(id: "other"), Operation(id: "y"),
        ])

        #expect(ordered == ["x", "other", "y", "both"])
    }

    @Test("a dependency that is not queued holds nothing back")
    func absentDependencyDoesNotDropTheOperation() {
        let ordered = Self.ordered([
            Operation(id: "orphan", dependsOn: ["settled"]), Operation(id: "other"),
        ])

        #expect(ordered == ["orphan", "other"])
    }

    @Test("a dependency cycle neither hangs nor loses an operation; it goes last")
    func cycleIsSurvivable() {
        let ordered = Self.ordered([
            Operation(id: "one", dependsOn: ["two"]), Operation(id: "two", dependsOn: ["one"]),
            Operation(id: "free"),
        ])

        #expect(ordered == ["free", "one", "two"])
    }

    @Test(
        "backoff starts at 2 s, doubles, and caps at 5 min",
        arguments: [
            (0, 2), (1, 2), (2, 4), (3, 8), (8, 256), (9, 300), (10, 300), (10_000, 300),
        ])
    func backoff(failures: Int, seconds: Int) {
        #expect(InventoryDrainBackoff.delay(afterFailures: failures) == .seconds(seconds))
    }
}
