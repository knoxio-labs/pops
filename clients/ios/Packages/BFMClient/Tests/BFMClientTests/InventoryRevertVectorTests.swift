import AppCore
import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import BFMClient

/// Sends `event.revert` through the whole transport and compares the mutation
/// that reaches the wire with the one
/// `pillars/inventory/contracts/command-vectors-v1.json` records for it, so a
/// revert the server's own tests never exercised cannot leave this build.
@Suite("BFMInventoryTransport event.revert against the command vector")
internal struct InventoryRevertVectorTests {
    /// This file sits seven path components below the repository root.
    private static var vectorsFile: URL {
        var root = URL(filePath: #filePath)
        for _ in 0..<7 { root.deleteLastPathComponent() }
        return root.appending(path: "pillars/inventory/contracts/command-vectors-v1.json")
    }

    private static func vectorMutation(named name: String) throws -> [String: Any] {
        let data = try Data(contentsOf: vectorsFile)
        let root = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let vectors = try #require(root["vectors"] as? [[String: Any]])
        let vector = try #require(vectors.first { $0["name"] as? String == name })
        return try #require(vector["mutation"] as? [String: Any])
    }

    @Test("the encoded revert matches event.revert-move field for field")
    func revertMatchesTheVector() async throws {
        let expected = try Self.vectorMutation(named: "event.revert-move")
        let args = try #require(expected["args"] as? [String: Any])
        let clientTime = try #require((expected["clientTime"] as? String).flatMap(Self.date))
        let bodies = RecordedBodies()
        let stub = StubTransport { _, body in
            if let body { await bodies.append(try await Data(collecting: body, upTo: 65_536)) }
            return (
                HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]),
                HTTPBody(InventoryWire.mutationsResponse())
            )
        }

        _ = try await BFMInventoryTransport.stubbed(stub).submit([
            InventoryOutboundMutation(
                mutationId: try #require(expected["mutationId"] as? String),
                command: .revertEvent(
                    seq: try #require(args["seq"] as? Int), entityKind: .item,
                    entityId: try #require(expected["entityId"] as? String)),
                baseRevision: nil, dependsOn: [], clientTime: clientTime)
        ])

        let sentBody = try #require(await bodies.all.first)
        let sent = try #require(try JSONSerialization.jsonObject(with: sentBody) as? [String: Any])
        let mutation = try #require((sent["mutations"] as? [[String: Any]])?.first)
        #expect(mutation["op"] as? String == expected["op"] as? String)
        #expect(mutation["entityId"] as? String == expected["entityId"] as? String)
        #expect(mutation["mutationId"] as? String == expected["mutationId"] as? String)
        #expect(NSDictionary(dictionary: mutation["args"] as? [String: Any] ?? [:]).isEqual(args))
        #expect((mutation["dependsOn"] as? [Any])?.isEmpty == true)
        #expect(expected["baseRevision"] is NSNull)
        #expect(mutation["baseRevision"] == nil || mutation["baseRevision"] is NSNull)
        #expect((mutation["clientTime"] as? String).flatMap(Self.date) == clientTime)
    }

    private static func date(_ text: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: text) ?? ISO8601DateFormatter().date(from: text)
    }
}
