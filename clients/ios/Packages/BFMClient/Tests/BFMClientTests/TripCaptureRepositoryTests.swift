import AppCore
import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import BFMClient

@Suite("Canonical capture transport")
internal struct TripCaptureRepositoryTests {
    @Test(
        "an uncertain save is not replayed automatically; explicit retry sends the same UUID and bytes"
    )
    internal func exactRetry() async throws {
        let recorded = CaptureBodies()
        let transport = StubTransport { _, body in
            await recorded.append(try await Data(collecting: body ?? HTTPBody(), upTo: 65_536))
            return (
                HTTPResponse(
                    status: .serviceUnavailable, headerFields: [.contentType: "application/json"]),
                HTTPBody(TripsWire.failure("gateway.upstream_unavailable"))
            )
        }
        let repository = try make(transport)
        let operation = TripCaptureCreateOperation(
            operationID: UUID(), input: TripCaptureInput(originalText: "  original\n"))
        await #expect(throws: (any Error).self) {
            try await repository.createCapture(tripID: 7, operation: operation)
        }
        #expect(await recorded.all.count == 1)
        await #expect(throws: (any Error).self) {
            try await repository.createCapture(tripID: 7, operation: operation)
        }
        let bodies = await recorded.all
        #expect(bodies.count == 2)
        #expect(bodies.first == bodies.last)
        #expect(
            try JSONDecoder().decode(TripCaptureCreateOperation.self, from: #require(bodies.first))
                == operation)
        let requests = await transport.recorded.all
        #expect(
            requests.allSatisfy {
                $0.request.method == .post && $0.request.path == "/mobile/trips/7/captures/create"
            })
    }

    @Test("the immutable receipt is distinct from the current replayed state")
    internal func originalReceipt() async throws {
        let id = UUID()
        let original = workspaceFields.replacingOccurrences(
            of: "\"captures\":[]", with: "\"captures\":[\(capture(title: "Original title"))]")
        let current = workspaceFields.replacingOccurrences(
            of: "\"captures\":[]", with: "\"captures\":[\(capture(title: "Changed later"))]")
        let result = """
            {"receipt":{\(original),
            "operationId":"\(id)",
            "undoneOperationId":null},
            "current":{\(current)},
            "undone":false,
            "replayed":true}
            """
        let repository = try make(StubTransport(status: .ok, json: result))
        let value = try await repository.createCapture(
            tripID: 7,
            operation: TripCaptureCreateOperation(
                operationID: id, input: TripCaptureInput(originalText: "source")))
        #expect(value.receipt.operationId == id)
        #expect(value.receipt.captures.first?.title == "Original title")
        #expect(value.current.captures.first?.title == "Changed later")
        #expect(value.current.captures.first?.originalText == "  original source")
        #expect(value.current.captures.first?.attachments == [.document(id: 12, taskID: nil)])
        #expect(!value.undone)
        #expect(value.replayed)
    }

    @Test("a wrong operation receipt never confirms the requested save")
    internal func wrongReceipt() async throws {
        let result = """
            {"receipt":{\(workspaceFields),
            "operationId":"\(UUID())",
            "undoneOperationId":null},
            "current":{\(workspaceFields)},
            "undone":false,
            "replayed":false}
            """
        let repository = try make(StubTransport(status: .ok, json: result))
        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository.createCapture(
                tripID: 7,
                operation: TripCaptureCreateOperation(
                    operationID: UUID(), input: TripCaptureInput(originalText: "source")))
        }
    }

    @Test("missing write consent is not presented as an empty workspace or a successful save")
    internal func missingGrant() async throws {
        let repository = try make(
            StubTransport(
                status: .forbidden,
                json:
                    #"{"code":"capability_not_granted","capability":"trips.capture.write","message":"Not granted"}"#
            ))
        await #expect(throws: RepositoryError.featureUnavailable) {
            try await repository.createCapture(
                tripID: 7,
                operation: TripCaptureCreateOperation(
                    operationID: UUID(), input: TripCaptureInput(originalText: "source")))
        }
    }

    private func capture(title: String) -> String {
        """
        {"id":3,
        "tripId":7,
        "originalText":"  original source",
        "originalUrl":null,
        "attachments":[{"kind":"document",
        "documentId":12}],
        "title":"\(title)",
        "notes":"",
        "classification":"document",
        "placeId":null,
        "visitId":null,
        "revision":1,
        "removedAt":null,
        "createdAt":"2026-11-01T00:00:00.123Z",
        "updatedAt":"2026-11-01T00:00:00.456Z"}
        """
    }
    private var workspaceFields: String {
        #""captures":[],"ideas":[],"associations":[],"memberships":[],"events":[],"journeys":[],"stays":[]"#
    }
    private func make(_ transport: StubTransport) throws -> BFMTripCapturesRepository {
        BFMTripCapturesRepository(
            client: BFMHTTPClient(
                baseURL: try #require(URL(string: "https://bfm.example")), transport: transport))
    }
}

private actor CaptureBodies {
    internal private(set) var all: [Data] = []
    internal func append(_ data: Data) { all.append(data) }
}
