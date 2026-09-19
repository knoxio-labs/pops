import AppCore
import Foundation
import Testing

@testable import InventoryReplica

@Suite("Mutation log on disk")
internal struct MutationLogDurabilityTests {
    private static let time = MutationLogPerformTests.time

    private static func open(_ directory: URL) throws -> InventoryReplica {
        try InventoryReplica(
            onDiskAt: directory, now: { Fixture.created }, freeBytes: { _ in .max })
    }

    @Test("a change made before the app is killed survives the relaunch, still waiting to send")
    func killAndReopenKeepsTheChange() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
            "MutationLogDurabilityTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        do {
            let replica = try Self.open(directory)
            try replica.apply(
                Fixture.snapshot(items: [Fixture.item("lamp", name: "Lamp", revision: 4)]))
            _ = try replica.perform(
                .editItem(id: "lamp", name: "Desk lamp", note: .unchanged, fields: [:]),
                mutationId: "m1", clientTime: Self.time)
        }

        let reopened = try Self.open(directory)

        #expect(try reopened.read(.item(id: "lamp"))?.name == "Desk lamp")
        let sent = try #require(try reopened.outboundMutations().first)
        #expect(sent.mutationId == "m1")
        #expect(sent.baseRevision == 4)
        #expect(
            sent.command == .editItem(id: "lamp", name: "Desk lamp", note: .unchanged, fields: [:]))
        try reopened.apply(Fixture.changes(items: [Fixture.item("mug", revision: 1)]))
        #expect(try reopened.read(.item(id: "lamp"))?.name == "Desk lamp")
    }
}
