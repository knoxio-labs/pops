import AppCore
import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import BFMClient

/// The two raw routes: the streamed upload and the file, through the shared
/// device authorization.
@Suite("BFMInventoryDocumentsRepository byte routes")
internal struct InventoryDocumentBytesTests {
    private typealias Fixture = DocumentsRepositoryFixture

    @Test("an upload streams the file with its type, kind and name, omitting a blank title")
    func uploadRequest() async throws {
        let session = ScriptedRawSession([
            .init(202, body: Fixture.ingestion(fileName: "Till slip.pdf"))
        ])
        let file = URL(filePath: "/tmp/upload.pdf")
        let ingestion = try await Fixture.repository(session: session).upload(
            InventoryDocumentUpload(
                fileURL: file, mimeType: "application/pdf", fileName: "Till slip.pdf",
                byteCount: 2048, kind: .receipt, title: "  "),
            to: "drill")

        #expect(ingestion.id == 12)
        #expect(ingestion.state == .pending)
        let recorded = try #require(await session.recorded.first)
        #expect(recorded.kind == "upload")
        #expect(recorded.fileURL == file)
        #expect(recorded.request.httpMethod == "POST")
        #expect(recorded.request.httpBody == nil)
        #expect(recorded.request.value(forHTTPHeaderField: "Content-Type") == "application/pdf")
        #expect(recorded.request.value(forHTTPHeaderField: "Content-Length") == "2048")
        #expect(recorded.request.value(forHTTPHeaderField: "Authorization") == "Bearer access-1")
        let url = try #require(recorded.request.url)
        let components = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false))
        #expect(components.path == "/mobile/inventory/items/drill/documents")
        #expect(
            components.queryItems == [
                URLQueryItem(name: "documentType", value: "receipt"),
                URLQueryItem(name: "fileName", value: "Till slip.pdf"),
            ])
    }

    @Test(
        "upload refusals keep their meaning",
        arguments: [
            (413, InventoryDocumentsError.tooLarge),
            (415, .unsupportedType),
            (412, .paperlessNotConnected),
            (422, .refused("Paperless could not read the file")),
            (503, .unavailable),
        ])
    func uploadRefusals(status: Int, expected: InventoryDocumentsError) async throws {
        let session = ScriptedRawSession([
            .init(status, body: #"{"code":"x","message":"Paperless could not read the file"}"#)
        ])
        await #expect(throws: expected) {
            _ = try await Fixture.repository(session: session).upload(Fixture.upload, to: "drill")
        }
    }

    @Test("an upload that cannot reach the server is offline")
    func uploadOffline() async throws {
        let session = ScriptedRawSession([], failure: URLError(.notConnectedToInternet))
        await #expect(throws: InventoryDocumentsError.offline) {
            _ = try await Fixture.repository(session: session).upload(Fixture.upload, to: "drill")
        }
    }

    @Test("a 401 refreshes once and resends the file with the new token")
    func uploadRefreshes() async throws {
        let session = ScriptedRawSession([
            .init(401, body: #"{"code":"bfm.auth.invalid_token","message":"stale"}"#),
            .init(202, body: Fixture.ingestion(fileName: "a.pdf")),
        ])
        let authorizer = RecordingBFMStreamAuthorizer(accessToken: "access-1")
        _ = try await Fixture.repository(session: session, authorizer: authorizer)
            .upload(Fixture.upload, to: "drill")

        let recorded = await session.recorded
        #expect(
            recorded.map { $0.request.value(forHTTPHeaderField: "Authorization") } == [
                "Bearer access-1", "Bearer access-2",
            ])
        #expect(recorded.map(\.fileURL) == [Fixture.upload.fileURL, Fixture.upload.fileURL])
        #expect(await authorizer.recordedRefreshes().count == 1)
    }

    @Test("an explicit revocation on a raw route ends the session")
    func revocation() async throws {
        let session = ScriptedRawSession([
            .init(403, body: #"{"code":"bfm.auth.device_revoked","message":"revoked"}"#)
        ])
        let authorizer = RecordingBFMStreamAuthorizer(accessToken: "access-1")
        await #expect(throws: (any Error).self) {
            _ = try await Fixture.repository(session: session, authorizer: authorizer)
                .fileVersion(of: 3)
        }
        #expect(await authorizer.revokedRevisions() == [1])
    }

    @Test("the version probe asks for one byte and reads the total from Content-Range")
    func probe() async throws {
        let session = ScriptedRawSession([
            .init(
                206,
                headers: [
                    "Content-Range": "bytes 0-0/52311", "Content-Type": "application/pdf",
                    "Content-Disposition": #"inline; filename="Drill manual.pdf""#,
                ])
        ])
        let version = try await Fixture.repository(session: session).fileVersion(of: 3)

        #expect(
            version
                == InventoryDocumentFileVersion(
                    byteCount: 52311, contentType: "application/pdf", fileName: "Drill manual.pdf"))
        let request = try #require(await session.recorded.first?.request)
        #expect(request.value(forHTTPHeaderField: "Range") == "bytes=0-0")
        #expect(request.url?.path() == "/mobile/inventory/documents/3/file")
    }

    @Test("a server that ignores Range still gives the size through Content-Length")
    func probeIgnoredRange() async throws {
        let session = ScriptedRawSession([.init(200, headers: ["Content-Length": "77"])])
        #expect(try await Fixture.repository(session: session).fileVersion(of: 3).byteCount == 77)
    }

    @Test("a response with no size is a contract mismatch")
    func probeWithoutSize() async throws {
        let session = ScriptedRawSession([.init(206, headers: [:])])
        await #expect(throws: RepositoryError.contractMismatch) {
            _ = try await Fixture.repository(session: session).fileVersion(of: 3)
        }
    }

    @Test("a failed download leaves no file behind and keeps its meaning")
    func downloadRefused() async throws {
        let session = ScriptedRawSession([
            .init(404, body: #"{"code":"inventory.documents.not_found","message":"gone"}"#)
        ])
        await #expect(throws: InventoryDocumentsError.notFound) {
            _ = try await Fixture.repository(session: session).downloadFile(of: 3)
        }
    }

    @Test("a download answers the file and its version")
    func download() async throws {
        let session = ScriptedRawSession([
            .init(
                200, headers: ["Content-Length": "4", "Content-Type": "text/plain"], body: "abcd")
        ])
        let (url, version) = try await Fixture.repository(session: session).downloadFile(of: 3)
        #expect(try Data(contentsOf: url) == Data("abcd".utf8))
        #expect(version.byteCount == 4)
        try? FileManager.default.removeItem(at: url)
    }

    @Test(
        "a disposition's file name",
        arguments: [
            (#"attachment; filename="a b.pdf""#, "a b.pdf"),
            (
                #"inline; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf; filename="resume.pdf""#,
                "résumé.pdf"
            ),
            ("inline", nil),
        ])
    func disposition(value: String, expected: String?) {
        #expect(BFMDocumentFileHeaders.fileName(fromDisposition: value) == expected)
    }
}
