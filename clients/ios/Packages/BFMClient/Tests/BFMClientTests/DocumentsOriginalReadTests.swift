import AppCore
import Foundation
import Testing

@testable import BFMClient

@Suite("Documents original metadata reads")
internal struct DocumentsOriginalReadTests {
    @Test(
        "metadata uses the original ID and keeps source fields without inventing file availability")
    internal func sourceMetadata() async throws {
        let transport = StubTransport(status: .ok, json: metadata(id: "99"))
        let value = try #require(try await repository(transport).document(id: 99))
        #expect(value.id == 99)
        #expect(value.title == "Source title")
        #expect(value.originalFileName == "Source.pdf")
        #expect(value.created == "source-created-value")
        let call = try #require(await transport.recorded.all.first)
        #expect(call.operationID == "mobileDocuments.getDocument")
        #expect(call.request.path == "/mobile/documents/99")
    }

    @Test(
        "nonintegral or mismatched owner IDs fail without rounding or substituting a different original"
    )
    internal func sourceIdentity() async throws {
        for id in ["99.5", "100", "0"] {
            await #expect(throws: RepositoryError.contractMismatch) {
                try await repository(StubTransport(status: .ok, json: metadata(id: id))).document(
                    id: 99)
            }
        }
    }

    @Test(
        "missing, unconfigured, capability-denied and unavailable originals retain distinct outcomes"
    )
    internal func refusalSemantics() async throws {
        let missing = try repository(StubTransport(status: .notFound, json: "unreadable"))
        #expect(try await missing.document(id: 99) == nil)
        let unconfigured = try repository(
            StubTransport(status: .preconditionFailed, json: "unreadable"))
        await #expect(throws: DocumentAccessError.notConfigured) {
            try await unconfigured.document(id: 99)
        }
        let denied = try repository(
            StubTransport(
                status: .forbidden,
                json:
                    #"{"code":"capability_not_granted","message":"Not granted","capability":"documents.read"}"#
            ))
        await #expect(throws: RepositoryError.featureUnavailable) {
            try await denied.document(id: 99)
        }
        let unavailable = try repository(
            StubTransport(
                status: .serviceUnavailable,
                json: TripsWire.failure("upstream_unavailable")))
        await #expect(throws: RepositoryError.unavailable) {
            try await unavailable.document(id: 99)
        }
    }

    private func repository(_ transport: StubTransport) throws -> BFMDocumentsRepository {
        let origin = try #require(URL(string: "https://bfm.example"))
        return BFMDocumentsRepository(
            client: BFMHTTPClient(baseURL: origin, transport: transport), baseURL: origin,
            authorizer: RecordingBFMStreamAuthorizer(accessToken: "access-1"),
            session: ScriptedRawSession([]))
    }

    private func metadata(id: String) -> String {
        """
        {"id":\(id),"title":"Source title","created":"source-created-value",\
        "originalFileName":"Source.pdf","thumbnailUrl":"/source/thumbnail/99"}
        """
    }
}
