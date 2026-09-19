import AppCore

@testable import InventoryReplica

/// Runs one command vector through the local reducer the way the server's
/// generator ran it through the engine: seed, the case's earlier mutations,
/// then the recorded one.
internal struct CommandVectorHarness {
    /// What the reducer answered, in the vector's own terms.
    struct Result {
        let replica: InventoryReplica
        let revision: Int
        let seq: Int?
        let outbound: [InventoryOutboundMutation]
    }

    /// The mutations a case runs before the one it records, to leave the
    /// history that one acts on. The vector file does not carry them
    /// (`command-vector-cases-items*.ts` does), so they are restated here,
    /// and a vector that needs one this table lacks fails its own outcome.
    static let earlierMutations: [String: (id: String, command: InventoryCommand)] = [
        "event.revert-move": (
            "30000000-0000-4000-8000-0000000000ff",
            .moveItem(
                id: "20000000-0000-4000-8000-000000000002",
                to: .location("10000000-0000-4000-8000-000000000001"), verb: .move)
        ),
        "item.removePhoto": (
            "30000000-0000-4000-8000-0000000000fe",
            .attachPhoto(
                itemId: "20000000-0000-4000-8000-000000000002",
                sha256: String(repeating: "a", count: 64),
                position: 0)
        ),
        "item.reorderPhotos": (
            "30000000-0000-4000-8000-0000000000fd",
            .attachPhoto(
                itemId: "20000000-0000-4000-8000-000000000002",
                sha256: String(repeating: "a", count: 64),
                position: 0)
        ),
    ]

    static func run(_ vector: CommandVectorFile.Vector) throws -> Result {
        let replica = try InventoryReplica(now: { CommandVectorDecoding.clock })
        try replica.store(CommandVectorDecoding.catalogue)
        try replica.apply(
            InventorySnapshotPage(
                epoch: "vectors", highWaterSeq: 0, catalogueVersion: "vectors",
                total: vector.seedItems.count + vector.seedLocations.count,
                items: try vector.seedItems.map(CommandVectorDecoding.item),
                locations: vector.seedLocations.map(CommandVectorDecoding.location),
                nextCursor: nil))
        let clientTime = try CommandVectorDecoding.date(vector.mutation.clientTime)
        var events = 0
        if let earlier = earlierMutations[vector.name] {
            let application = try replica.performLocally(
                earlier.command, mutationId: earlier.id, clientTime: clientTime)
            let seq = events + (application.written.eventIndex ?? 0) + 1
            events += application.events.count
            try replica.markSending([earlier.id], at: clientTime)
            try replica.recordOutcomes(
                InventoryMutationBatchResult(
                    outcomes: [
                        earlier.id: .applied(
                            revision: application.written.revision, seq: seq, converged: false)
                    ], highWaterSeq: events))
        }
        let command = try CommandVectorDecoding.command(
            vector.mutation, locations: Set(vector.seedLocations.map(\.id)))
        let application = try replica.performLocally(
            command, mutationId: vector.mutation.mutationId, clientTime: clientTime)
        return Result(
            replica: replica, revision: application.written.revision,
            seq: application.written.eventIndex.map { events + $0 + 1 },
            outbound: try replica.outboundMutations())
    }
}
