import AppCore
import Foundation
import Testing

@testable import BFMClient

@Suite("Documents original byte reads")
internal struct DocumentsFileReaderTests {
    @Test("original IDs use their own route and actual returned bytes with recorded headers")
    internal func originalIdentity() async throws {
        let session = ScriptedRawSession([
            .init(
                200, headers: ["Content-Length": "4", "Content-Type": "text/plain"], body: "abcd")
        ])
        let file = try await reader(session).file(id: 99)
        defer { try? FileManager.default.removeItem(at: file.temporaryURL) }
        #expect(try Data(contentsOf: file.temporaryURL) == Data("abcd".utf8))
        #expect(file.metadata.byteCount == 4)
        #expect(file.metadata.contentType == "text/plain")
        let request = try #require(await session.recorded.first?.request)
        #expect(request.url?.path() == "/mobile/documents/99/file")
        #expect(request.value(forHTTPHeaderField: "Range") == nil)
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer access-1")
    }

    @Test("unknown file size remains unknown while filename and MIME headers survive")
    internal func independentHeaders() async throws {
        let session = ScriptedRawSession([
            .init(
                200,
                headers: [
                    "Content-Type": "application/pdf",
                    "Content-Disposition": "inline; filename*=UTF-8''Ticket%20original.pdf",
                ], body: "bytes")
        ])
        let file = try await reader(session).file(id: 5)
        defer { try? FileManager.default.removeItem(at: file.temporaryURL) }
        #expect(file.metadata.byteCount == nil)
        #expect(file.metadata.contentType == "application/pdf")
        #expect(file.metadata.fileName == "Ticket original.pdf")
    }

    @Test(
        "missing and unconfigured originals remain distinct and remove refused payloads",
        arguments: [(404, DocumentAccessError.notFound), (412, .notConfigured)])
    internal func sourceFailures(status: Int, expected: DocumentAccessError) async throws {
        let session = ScriptedRawSession([.init(status, body: "refused")])
        await #expect(throws: expected) { _ = try await reader(session).file(id: 5) }
        let downloads = await session.downloads
        #expect(downloads.count == 1)
        #expect(downloads.allSatisfy { !FileManager.default.fileExists(atPath: $0.path()) })
    }

    @Test("an unsolicited partial response cannot masquerade as the complete original")
    internal func partialResponse() async throws {
        let session = ScriptedRawSession([.init(206, body: "partial")])
        await #expect(throws: RepositoryError.contractMismatch) {
            _ = try await reader(session).file(id: 5)
        }
        #expect(
            await session.downloads.allSatisfy {
                !FileManager.default.fileExists(atPath: $0.path())
            })
    }

    @Test("expired credentials refresh once and discard the refused file")
    internal func refresh() async throws {
        let session = ScriptedRawSession([
            .init(401, body: "expired"), .init(200, body: "original"),
        ])
        let authorizer = RecordingBFMStreamAuthorizer(accessToken: "access-1")
        let file = try await reader(session, authorizer: authorizer).file(id: 5)
        defer { try? FileManager.default.removeItem(at: file.temporaryURL) }
        let downloads = await session.downloads
        let first = try #require(downloads.first)
        #expect(downloads.count == 2)
        #expect(!FileManager.default.fileExists(atPath: first.path()))
        #expect(try Data(contentsOf: file.temporaryURL) == Data("original".utf8))
        #expect(await authorizer.recordedRefreshes().count == 1)
        #expect(
            await session.recorded.map {
                $0.request.value(forHTTPHeaderField: "Authorization")
            } == ["Bearer access-1", "Bearer access-2"])
    }

    @Test(
        "rate limiting uses typed status and server metadata without inventing a wait",
        arguments: ["37", "invalid", "", nil])
    internal func rateLimit(header: String?) async throws {
        let session = ScriptedRawSession([
            .init(429, headers: header.map { ["Retry-After": $0] } ?? [:], body: "unreadable")
        ])
        await #expect(
            throws: RepositoryError.rateLimited(retryAfterSeconds: header == "37" ? 37 : nil)
        ) {
            _ = try await reader(session).file(id: 5)
        }
    }

    @Test(
        "typed body retry metadata wins, while an invalid negative value uses the valid header",
        arguments: [(9, 9), (-1, 37)])
    internal func rateLimitBody(value: Int, expected: Int) async throws {
        let body = "{\"code\":\"rate_limited\",\"retryAfterSeconds\":\(value)}"
        let session = ScriptedRawSession([
            .init(429, headers: ["Retry-After": "37"], body: body)
        ])
        await #expect(throws: RepositoryError.rateLimited(retryAfterSeconds: expected)) {
            _ = try await reader(session).file(id: 5)
        }
    }

    @Test(
        "only explicit device revocation ends the session, distinct from a missing capability",
        arguments: [
            ("capability_not_granted", RepositoryError.featureUnavailable, false),
            ("bfm.auth.device_revoked", .unauthorized, true),
        ])
    internal func refusalIdentity(code: String, expected: RepositoryError, revoked: Bool)
        async throws
    {
        let session = ScriptedRawSession([.init(403, body: "{\"code\":\"\(code)\"}")])
        let authorizer = RecordingBFMStreamAuthorizer(accessToken: "access-1")
        await #expect(throws: expected) {
            _ = try await reader(session, authorizer: authorizer).file(id: 5)
        }
        #expect(await authorizer.revokedRevisions() == (revoked ? [1] : []))
    }

    @Test("invalid original IDs are rejected before making any request")
    internal func invalidIdentity() async throws {
        let session = ScriptedRawSession([])
        await #expect(throws: RepositoryError.requestRejected) {
            _ = try await reader(session).file(id: 0)
        }
        #expect(await session.recorded.isEmpty)
    }

    @Test(
        "file transport failures retain the existing shared timeout and offline classifications",
        arguments: [URLError.Code.timedOut, .notConnectedToInternet])
    internal func transport(code: URLError.Code) async throws {
        let session = ScriptedRawSession([], failure: URLError(code))
        let expected = code == .timedOut ? PopsError.timeout : PopsError.offline
        await #expect(throws: RepositoryError.transport(expected)) {
            _ = try await reader(session).file(id: 5)
        }
    }

    private func reader(
        _ session: ScriptedRawSession,
        authorizer: RecordingBFMStreamAuthorizer = RecordingBFMStreamAuthorizer(
            accessToken: "access-1")
    ) throws -> BFMDocumentsFileReader {
        BFMDocumentsFileReader(
            baseURL: try #require(URL(string: "https://bfm.example")), authorizer: authorizer,
            session: session)
    }
}
