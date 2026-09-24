import AppCore
import Foundation
import Testing

@testable import InventoryReplica

@Suite("Replica: version-2 decimal equality evaluated on the phone")
internal struct LocalDecimalEqualityTests {
    private typealias Setup = LocalComputedFixture

    private static func literal(_ text: String) -> InventoryJSON {
        .object(["op": .string("literal"), "value": .string(text)])
    }

    /// `volume` becomes `if(width = 2, 1, 0)`, stored as `expressionVersion`.
    private static func replica(expressionVersion: Int) throws -> InventoryReplica {
        let test = InventoryJSON.object([
            "op": .string("if"),
            "condition": .object([
                "op": .string("equal"), "left": Setup.read(Setup.width), "right": literal("2"),
            ]),
            "then": literal("1"), "else": literal("0"),
        ])
        return try LocalComputedValueTests.replica(
            catalogue: Setup.catalogue(
                replacing: [Setup.volume: test], expressionVersion: expressionVersion))
    }

    @Test("a read decimal 2.00 equals 2 by value, typed by the replica's catalogue")
    func comparesByValue() throws {
        let replica = try Self.replica(expressionVersion: 2)

        try LocalComputedValueTests.edit(
            replica, Setup.box, Setup.width, [try Setup.decimal("2.00")], mutationId: "m1")

        #expect(
            try Setup.display(replica, Setup.box, Setup.volume) == .value(try Setup.decimal("1")))
    }

    @Test("version 1 still compares the spelling")
    func versionOneComparesSpelling() throws {
        let replica = try Self.replica(expressionVersion: 1)

        try LocalComputedValueTests.edit(
            replica, Setup.box, Setup.width, [try Setup.decimal("2.00")], mutationId: "m1")

        #expect(
            try Setup.display(replica, Setup.box, Setup.volume) == .value(try Setup.decimal("0")))
    }
}
