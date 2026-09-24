import AppCore
import Foundation
import Testing

/// Every command vector the server generated, through the phone's reducer:
/// the same outcome (revision, and the `seq` its event would take), the
/// same mutation on the wire, and the state the server's op leaves.
@Suite("Command vectors through the local reducer")
internal struct CommandVectorTests {
    private static let vectors: [CommandVectorFile.Vector] = {
        do {
            return try CommandVectorFile.load().vectors
        } catch {
            return []
        }
    }()

    @Test("the vendored file loads, at version 1, with a state check for every vector")
    func everyVectorIsCovered() throws {
        let file = try CommandVectorFile.load()
        #expect(file.version == 1)
        #expect(file.vectors.count == 24)
        let names = Set(file.vectors.map(\.name))
        #expect(names == Set(CommandVectorStates.checks.keys))
    }

    @Test("the reducer answers the server's outcome", arguments: vectors.map(\.name))
    func outcomeMatches(name: String) throws {
        let vector = try #require(Self.vectors.first { $0.name == name })
        let result = try CommandVectorHarness.run(vector)

        #expect(vector.op == vector.mutation.op)
        #expect(vector.outcome.mutationId == vector.mutation.mutationId)
        #expect(vector.outcome.status == "applied")
        #expect(result.revision == vector.outcome.revision)
        #expect(result.seq == vector.outcome.seq)
    }

    @Test("the logged mutation goes out as the vector's", arguments: vectors.map(\.name))
    func outboundMatches(name: String) throws {
        let vector = try #require(Self.vectors.first { $0.name == name })
        let result = try CommandVectorHarness.run(vector)
        let command = try CommandVectorDecoding.command(
            vector.mutation, locations: Set(vector.seedLocations.map(\.id)))

        let sent = try #require(result.outbound.only)
        #expect(sent.mutationId == vector.mutation.mutationId)
        #expect(sent.command == command)
        #expect(sent.command.entityId == vector.mutation.entityId)
        #expect(sent.baseRevision == vector.mutation.baseRevision)
        if let catalogueRevision = vector.mutation.catalogueRevision {
            #expect(sent.catalogueRevision == catalogueRevision)
        }
        #expect(sent.dependsOn == vector.mutation.dependsOn)
        #expect(sent.clientTime == (try CommandVectorDecoding.date(vector.mutation.clientTime)))
    }

    @Test("the reducer leaves the state the server's op leaves", arguments: vectors.map(\.name))
    func stateMatches(name: String) throws {
        let vector = try #require(Self.vectors.first { $0.name == name })
        let result = try CommandVectorHarness.run(vector)
        let check = try #require(CommandVectorStates.checks[name])

        try check(result.replica)
    }
}

extension Array {
    fileprivate var only: Element? { count == 1 ? first : nil }
}
