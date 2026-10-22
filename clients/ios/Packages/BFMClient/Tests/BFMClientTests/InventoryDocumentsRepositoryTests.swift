import AppCore
import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import BFMClient

@Suite("BFMInventoryDocumentsRepository")
internal struct InventoryDocumentsRepositoryTests {
    private static let list = """
        {"maxUploadBytes":104857600,"allowedMimeTypes":["application/pdf","image/*"],
        "linked":[{"id":3,"paperlessDocumentId":41,"documentType":"warranty","title":"Warranty",
        "createdAt":"2026-10-01T00:00:00Z","missing":false},
        {"id":4,"paperlessDocumentId":42,"documentType":"contract","title":null,
        "createdAt":"2026-10-01T00:00:00Z","missing":null}],
        "pending":[{"id":8,"documentType":"receipt","title":null,"fileName":"scan.pdf",
        "state":"pending","reason":null,"createdAt":"2026-10-01T00:00:00Z"}],
        "failed":[{"id":9,"documentType":"manual","title":"Manual","fileName":"m.pdf",
        "state":"failed","reason":"Paperless refused it","createdAt":"2026-10-01T00:00:00Z"}]}
        """
    private static let paperlessMissing = """
        {"code":"documents.paperless.not_configured","message":"Paperless is not connected",
        "requestId":"r-1","retryable":false,
        "details":{"upstream":{"pillar":"documents","status":412}}}
        """
    private typealias Fixture = DocumentsRepositoryFixture

    @Test("the list maps every row, reading an unknown kind as other")
    func mapsList() async throws {
        let stub = StubTransport(status: .ok, json: Self.list)
        let documents = try await Fixture.repository(stub).documents(of: "drill")

        #expect(documents.limits.maxUploadBytes == 104_857_600)
        #expect(documents.limits.allowedMimeTypes == ["application/pdf", "image/*"])
        #expect(documents.linked.map(\.kind) == [.warranty, .other])
        #expect(documents.linked.map(\.presence) == [.present, .unknown])
        #expect(documents.pending.map(\.state) == [.pending])
        #expect(documents.failed.first?.reason == "Paperless refused it")
        let sent = await stub.recorded.all
        #expect(sent.first?.request.path == "/mobile/inventory/items/drill/documents")
    }

    @Test("a 412 reads as Paperless not connected, a 503 as unavailable")
    func listRefusals() async throws {
        await #expect(throws: InventoryDocumentsError.paperlessNotConnected) {
            _ = try await Fixture.repository(
                StubTransport(status: .preconditionFailed, json: Self.paperlessMissing)
            ).documents(of: "drill")
        }
        await #expect(throws: InventoryDocumentsError.unavailable) {
            _ = try await Fixture.repository(
                StubTransport(
                    status: .serviceUnavailable,
                    json: #"{"code":"gateway.upstream_unavailable","message":"down"}"#)
            ).documents(of: "drill")
        }
    }

    @Test("a rename sends only the title, a re-type only the kind")
    func patchSendsChangedKeyOnly() async throws {
        let bodies = BodyRecorder()
        let stub = StubTransport { _, body in
            await bodies.append(try await Data(collecting: try #require(body), upTo: 4096))
            return (
                HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]),
                HTTPBody(
                    #"{"id":3,"paperlessDocumentId":41,"documentType":"warranty","title":"T","createdAt":"x"}"#
                )
            )
        }
        let repository = try Fixture.repository(stub)

        try await repository.updateDocument(3, InventoryDocumentEdit(title: "Till slip"))
        try await repository.updateDocument(3, InventoryDocumentEdit(kind: .invoice))

        let sent = try await bodies.all.map {
            try JSONSerialization.jsonObject(with: $0) as? [String: String]
        }
        #expect(sent == [["title": "Till slip"], ["documentType": "invoice"]])
        #expect(await stub.recorded.all.map(\.request.method) == [.patch, .patch])
        #expect(await stub.recorded.all.first?.request.path == "/mobile/inventory/documents/3")
    }

    @Test("an edit on a document Paperless lost is not found")
    func patchNotFound() async throws {
        await #expect(throws: InventoryDocumentsError.notFound) {
            try await Fixture.repository(
                StubTransport(
                    status: .notFound,
                    json:
                        #"{"code":"inventory.documents.paperless_document_missing","message":"gone"}"#
                )
            ).updateDocument(3, InventoryDocumentEdit(title: "x"))
        }
    }

    @Test("unlink and dismiss hit their own routes")
    func unlinkAndDismiss() async throws {
        let stub = StubTransport(status: .ok, json: #"{"id":3}"#)
        let repository = try Fixture.repository(stub)
        try await repository.unlinkDocument(3)
        try await repository.dismissIngestion(9)
        let sent = await stub.recorded.all
        #expect(sent.map(\.request.method) == [.delete, .delete])
        #expect(
            sent.map(\.request.path) == [
                "/mobile/inventory/documents/3", "/mobile/inventory/document-ingestions/9",
            ])
    }
}
