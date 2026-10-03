import AppCore
import CryptoKit
import Foundation
import Testing

@testable import BFMClient

@Suite
internal struct EgoWireTests {
    @Test
    func fixturePartsDecodeOrAreDropped() throws {
        let fixture = try EgoWireFixture.load()
        let valid = try fixture.entries("parts", "valid")
        let invalid = try fixture.entries("parts", "invalid")
        var decoded: [BFMEgoFlatPart] = []

        for raw in valid {
            let flat = try JSONDecoder().decode(BFMEgoFlatPart.self, from: fixture.data(raw))
            decoded.append(flat)
            guard let part = flat.domainPart else {
                Issue.record("Valid \(flat.type) part was dropped")
                continue
            }
            switch (flat.type, part) {
            case ("text", .text(_)), ("entity", .entity(_)), ("actions", .actions(_)):
                break
            default:
                Issue.record("\(flat.type) decoded to the wrong domain case")
            }
        }

        for raw in invalid {
            let flat = try JSONDecoder().decode(BFMEgoFlatPart.self, from: fixture.data(raw))
            decoded.append(flat)
            #expect(flat.domainPart == nil)
        }

        #expect(BFMEgoWire.parts(decoded).count == valid.count)
    }

    @Test
    func actionPartWithUnknownStatusIsDroppedAsAWhole() throws {
        let payload = Data(
            #"""
            {
              "type": "actions",
              "batchId": "batch-1",
              "actions": [
                {"actionId": "a-1", "tool": "t1", "summary": "first", "status": "executed"},
                {"actionId": "a-2", "tool": "t2", "summary": "second", "status": "waiting"}
              ]
            }
            """#.utf8)
        let part = try JSONDecoder().decode(BFMEgoFlatPart.self, from: payload)

        #expect(part.domainPart == nil)
    }

    @Test
    func subtitleAcceptsNull() throws {
        let payload = Data(
            #"{"type":"entity","uri":"pops:inventory/item/i-1","title":"Item","subtitle":null}"#
                .utf8)
        let part = try JSONDecoder().decode(BFMEgoFlatPart.self, from: payload)

        guard case .entity(let entity) = part.domainPart else {
            Issue.record("Entity part was not decoded")
            return
        }
        #expect(entity.subtitle == nil)
    }

    @Test
    func fixtureFramesDecodeKnownEventsAndSkipUnknownFrames() throws {
        let fixture = try EgoWireFixture.load()
        for raw in try fixture.entries("frames", "valid") {
            let payload = try fixture.json(raw)
            guard let event = try BFMEgoWire.event(fromFramePayload: payload) else {
                Issue.record("Known frame was dropped")
                continue
            }
            let type = try fixture.string("type", in: raw)
            switch (type, event) {
            case ("token", .token(let text)):
                #expect(text == (try fixture.string("text", in: raw)))
            case ("tool", .tool(let name, let status)):
                #expect(name == (try fixture.string("name", in: raw)))
                #expect(status.rawValue == (try fixture.string("status", in: raw)))
            case ("part", .part(let part)):
                let rawPart = try fixture.object(raw["part"], "part")
                let flat = try JSONDecoder().decode(
                    BFMEgoFlatPart.self, from: fixture.data(rawPart))
                #expect(part == flat.domainPart)
            case ("navigate", .navigate(let uri)):
                #expect(uri == (try fixture.string("uri", in: raw)))
            case ("done", .done(let conversationId, let messageId, let parts)):
                #expect(conversationId == (try fixture.string("conversationId", in: raw)))
                #expect(messageId == (try fixture.string("messageId", in: raw)))
                let rawParts = try fixture.objectArray(raw["parts"], "parts")
                let flat = try rawParts.map {
                    try JSONDecoder().decode(BFMEgoFlatPart.self, from: fixture.data($0))
                }
                #expect(parts == BFMEgoWire.parts(flat))
            case ("error", .failed(let message, let retryable)):
                #expect(message == (try fixture.string("message", in: raw)))
                #expect(retryable == (try fixture.bool("retryable", in: raw)))
            default:
                Issue.record("\(type) decoded to the wrong stream event")
            }
        }

        for raw in try fixture.entries("frames", "unknown") {
            #expect(try BFMEgoWire.event(fromFramePayload: fixture.json(raw)) == nil)
        }
    }

    @Test
    func invalidKnownFramesThrowContractMismatch() throws {
        let fixture = try EgoWireFixture.load()
        for raw in try fixture.entries("frames", "invalid") {
            let payload = try fixture.json(raw)
            #expect(throws: RepositoryError.contractMismatch) {
                try BFMEgoWire.event(fromFramePayload: payload)
            }
        }

        #expect(throws: RepositoryError.contractMismatch) {
            try BFMEgoWire.event(
                fromFramePayload:
                    #"{"type":"part","part":{"type":"entity","uri":"pops:inventory/item/i-1"}}"#)
        }
    }

    @Test
    func unknownPartFrameIsSkipped() throws {
        let event = try BFMEgoWire.event(
            fromFramePayload:
                #"{"type":"part","part":{"type":"hologram","payload":{"future":true}}}"#)

        #expect(event == nil)
    }

    @Test
    func fixtureDigestMatchesThePinnedBFMContract() throws {
        let bytes = try EgoWireFixture.load().bytes
        let digest = SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()

        #expect(digest == "c3aac1d485555c36d8d447a72e1788cea321c2589c4c17ffe85852aa2f0bc14f")
    }

    @Test
    func chatBodyOmitsNilKeys() throws {
        let body = try BFMEgoWire.chatBody(
            message: "Show this item",
            conversationId: nil,
            context: EgoAppContext(
                app: "inventory", uri: "pops:inventory/item/i-1", route: nil, entityTitle: nil))
        let object = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
        let context = try #require(object["appContext"] as? [String: Any])

        #expect(object["message"] as? String == "Show this item")
        #expect(object["conversationId"] == nil)
        #expect(context["app"] as? String == "inventory")
        #expect(context["uri"] as? String == "pops:inventory/item/i-1")
        #expect(context["route"] == nil)
        let bodyString = try #require(String(bytes: body, encoding: .utf8))
        #expect(!bodyString.contains("null"))
    }

    @Test
    func resumeBodyContainsExactlyItsTwoWireKeys() throws {
        let body = try BFMEgoWire.resumeBody(conversationId: "c-1", batchId: "batch-1")
        let object = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])

        #expect(Set(object.keys) == Set(["conversationId", "resumeBatchId"]))
        #expect(object["conversationId"] as? String == "c-1")
        #expect(object["resumeBatchId"] as? String == "batch-1")
    }
}

private struct EgoWireFixture {
    private struct Missing: Error {
        let field: String
    }

    let bytes: Data
    private let root: [String: Any]

    private init(bytes: Data) throws {
        self.bytes = bytes
        root = try Self.require(
            JSONSerialization.jsonObject(with: bytes) as? [String: Any], "fixture object")
    }

    static func load(from sourceFile: String = #filePath) throws -> Self {
        var directory = URL(fileURLWithPath: sourceFile).deletingLastPathComponent()
        while directory.path != "/" {
            let candidate = directory.appendingPathComponent("Contracts/ego-wire-v1.json")
            if FileManager.default.fileExists(atPath: candidate.path) {
                return try Self(bytes: Data(contentsOf: candidate))
            }
            directory.deleteLastPathComponent()
        }
        throw Missing(field: "Contracts/ego-wire-v1.json")
    }

    func entries(_ groupName: String, _ entryName: String) throws -> [[String: Any]] {
        let group = try object(root[groupName], groupName)
        return try Self.require(group[entryName] as? [[String: Any]], "\(groupName).\(entryName)")
    }

    func objectArray(_ value: Any?, _ field: String) throws -> [[String: Any]] {
        try Self.require(value as? [[String: Any]], field)
    }

    func object(_ value: Any?, _ field: String) throws -> [String: Any] {
        try Self.require(value as? [String: Any], field)
    }

    func string(_ key: String, in object: [String: Any]) throws -> String {
        try Self.require(object[key] as? String, key)
    }

    func bool(_ key: String, in object: [String: Any]) throws -> Bool {
        try Self.require(object[key] as? Bool, key)
    }

    func data(_ value: [String: Any]) throws -> Data {
        try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    }

    func json(_ value: [String: Any]) throws -> String {
        try #require(String(bytes: data(value), encoding: .utf8))
    }

    private static func require<Value>(_ value: Value?, _ field: String) throws -> Value {
        guard let value else { throw Missing(field: field) }
        return value
    }
}
