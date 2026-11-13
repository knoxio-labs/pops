import AppCore
import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import BFMClient

@Suite("Generated Trip metadata PATCH transport")
internal struct TripMetadataWireTests {
    @Test(
        "the actual adapter sends omitted, null and selected values through the generated PATCH",
        arguments: ["omitted", "cleared", "selected"])
    internal func fieldPresence(state: String) async throws {
        let patch: TripMetadataPatch
        let expected: String
        switch state {
        case "cleared":
            patch = TripMetadataPatch(name: .cleared, tagId: .cleared, parentId: .cleared)
            expected = #"{"name":null,"tagId":null,"parentId":null}"#
        case "selected":
            patch = TripMetadataPatch(name: .set("Name"), tagId: .set("tag"), parentId: .set(9))
            expected = #"{"name":"Name","tagId":"tag","parentId":9}"#
        default:
            patch = TripMetadataPatch()
            expected = "{}"
        }
        let recording = TripPatchBodies()
        let transport = StubTransport { _, body in
            await recording.append(try await Data(collecting: body ?? HTTPBody(), upTo: 65_536))
            return (
                HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]),
                HTTPBody(TripsWire.trip(7))
            )
        }
        let result = try await repository(transport).updateTrip(id: 7, patch: patch)
        #expect(result?.id == 7)
        let requests = await transport.recorded.all
        #expect(requests.count == 1)
        #expect(requests.first?.request.method == .patch)
        #expect(requests.first?.request.path == "/mobile/trips/7")
        try assertJSON(try #require(await recording.all.first), equals: expected)
    }

    @Test("all seven metadata fields retain their exact wire values and source links")
    internal func sevenFields() async throws {
        let recording = TripPatchBodies()
        let transport = StubTransport { _, body in
            await recording.append(try await Data(collecting: body ?? HTTPBody(), upTo: 65_536))
            return (
                HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]),
                HTTPBody(TripsWire.trip(7))
            )
        }
        let patch = TripMetadataPatch(
            name: .cleared, destination: "", when: "  Christmas, perhaps longer\n",
            tagId: .set("tag"), parentId: .cleared, notes: "",
            sourceLinks: [TripSourceLink(uri: "https://example.test/original", label: nil)])
        _ = try await repository(transport).updateTrip(id: 7, patch: patch)
        let expected =
            #"{"name":null,"destination":"","when":"  Christmas, perhaps longer\n","#
            + #""tagId":"tag","parentId":null,"notes":"","#
            + #""sourceLinks":[{"uri":"https://example.test/original"}]}"#
        try assertJSON(try #require(await recording.all.first), equals: expected)
    }

    @Test("the actual generated component rejects unknown fields before adapter dispatch")
    internal func unknownField() async throws {
        let transport = StubTransport(status: .ok, json: TripsWire.trip(7))
        await #expect(throws: (any Error).self) {
            let body = try JSONDecoder().decode(
                Components.Schemas.MobileTripPatchInput.self,
                from: Data(#"{"unexpected":true}"#.utf8))
            _ = try await repository(transport).updateTrip(id: 7, patch: body.patch)
        }
        #expect(await transport.recorded.all.isEmpty)
    }

    @Test("a foreign successful Trip cannot replace the selected source")
    internal func wrongIdentity() async throws {
        let transport = StubTransport(status: .ok, json: TripsWire.trip(8))
        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository(transport).updateTrip(
                id: 7, patch: TripMetadataPatch(notes: "Changed"))
        }
    }

    @Test("known missing source remains distinct from unavailable or missing consent")
    internal func failures() async throws {
        let missing = StubTransport(status: .notFound, json: failure("not_found", status: 404))
        #expect(try await repository(missing).updateTrip(id: 7, patch: TripMetadataPatch()) == nil)
        let denied = StubTransport(
            status: .forbidden,
            json:
                #"{"code":"capability_not_granted","capability":"trips.write","message":"Not granted"}"#
        )
        await #expect(throws: RepositoryError.featureUnavailable) {
            try await repository(denied).updateTrip(id: 7, patch: TripMetadataPatch())
        }
        let unavailable = StubTransport(
            status: .serviceUnavailable, json: failure("gateway.upstream_unavailable", status: 503))
        await #expect(throws: RepositoryError.unavailable) {
            try await repository(unavailable).updateTrip(
                id: 7, patch: TripMetadataPatch(notes: "Retain"))
        }
        #expect(await unavailable.recorded.all.count == 1)
        let malformed = StubTransport(status: .notFound, json: "{}")
        await #expect(throws: (any Error).self) {
            try await repository(malformed).updateTrip(id: 7, patch: TripMetadataPatch())
        }
    }

    @Test(
        "a 404 with foreign upstream identity or non-missing status is a contract mismatch",
        arguments: ["foreign owner", "different status"])
    internal func missingProvenance(fault: String) async throws {
        let body = failure(
            "not_found", status: fault == "different status" ? 503 : 404,
            pillar: fault == "foreign owner" ? "documents" : "trips")
        let transport = StubTransport(status: .notFound, json: body)
        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository(transport).updateTrip(id: 7, patch: TripMetadataPatch())
        }
    }

    private func failure(_ code: String, status: Int, pillar: String = "trips") -> String {
        """
        {"code":"\(code)","message":"Request refused","requestId":"trip-request","retryable":false,
        "details":{"upstream":{"pillar":"\(pillar)","status":\(status)}}}
        """
    }

    private func repository(_ transport: StubTransport) throws -> BFMTripMetadataRepository {
        BFMTripMetadataRepository(
            client: BFMHTTPClient(
                baseURL: try #require(URL(string: "https://bfm.example")), transport: transport))
    }

    private func assertJSON(_ actual: Data, equals expected: String) throws {
        let actual = try #require(JSONSerialization.jsonObject(with: actual) as? NSDictionary)
        let expected = try #require(
            JSONSerialization.jsonObject(with: Data(expected.utf8)) as? NSDictionary)
        #expect(actual == expected)
    }
}

private actor TripPatchBodies {
    internal private(set) var all: [Data] = []
    internal func append(_ body: Data) { all.append(body) }
}
