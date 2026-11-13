import AppCore
import Foundation
import Testing

@testable import BFMClient

@Suite("Canonical Trip PATCH field presence")
internal struct TripPatchBodyTests {
    @Test("unselected fields produce an empty object, not null mutations")
    internal func omitted() throws {
        #expect(try encoded(TripMetadataPatch()) == "{}")
        #expect(try decode("{}").patch == TripMetadataPatch())
    }

    @Test("nullable name, tag and parent distinguish omission, explicit null and a selected value")
    internal func nullableFacts() throws {
        let clearing = TripMetadataPatch(name: .cleared, tagId: .cleared, parentId: .cleared)
        #expect(try encoded(clearing) == #"{"name":null,"parentId":null,"tagId":null}"#)
        #expect(try decode(encoded(clearing)).patch == clearing)
        let setting = TripMetadataPatch(name: .set("Name"), tagId: .set("tag"), parentId: .set(9))
        #expect(try encoded(setting) == #"{"name":"Name","parentId":9,"tagId":"tag"}"#)
        #expect(try decode(encoded(setting)).patch == setting)
    }

    @Test("all seven fields preserve exact values including opaque When and empty metadata")
    internal func everyField() throws {
        let patch = TripMetadataPatch(
            name: .set("Name"), destination: "", when: "  Christmas, perhaps longer\n",
            tagId: .cleared, parentId: .set(9), notes: "", sourceLinks: [])
        let wire = try encoded(patch)
        let expected =
            #"{"destination":"","name":"Name","notes":"","parentId":9,"#
            + #""sourceLinks":[],"tagId":null,"when":"  Christmas, perhaps longer\n"}"#
        #expect(wire == expected)
        #expect(try decode(wire).patch == patch)
        let link = TripSourceLink(uri: "https://example.test/source", label: "Original")
        let linked = TripMetadataPatch(sourceLinks: [link])
        #expect(try decode(encoded(linked)).patch == linked)
    }

    @Test(
        "null for non-nullable facts, wrong types and unknown fields fail instead of becoming omission",
        arguments: [
            #"{"destination":null}"#, #"{"when":null}"#, #"{"notes":null}"#,
            #"{"sourceLinks":null}"#, #"{"parentId":"9"}"#, #"{"extra":true}"#,
        ])
    internal func invalidWire(wire: String) {
        #expect(throws: (any Error).self) { try decode(wire) }
    }

    private func encoded(_ patch: TripMetadataPatch) throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return try #require(
            String(bytes: try encoder.encode(BFMTripPatchBody(patch)), encoding: .utf8))
    }
    private func decode(_ wire: String) throws -> BFMTripPatchBody {
        try JSONDecoder().decode(BFMTripPatchBody.self, from: Data(wire.utf8))
    }
}
