import AppCore
import Foundation
import HTTPTypes
import Testing

@testable import BFMClient

/// `BFMInventoryTransport.uploadMedia`/`fetchMedia` (A22, ADR-002 D9): the
/// content-addressed media relay ahead of `item.attachPhoto`.
@Suite("BFMInventoryTransport media")
internal struct InventoryMediaMappingTests {
    private static let sha = String(repeating: "a", count: 64)

    private func upload(
        status: HTTPResponse.Status, json: String
    ) async throws -> InventoryMediaUploadResult {
        try await BFMInventoryTransport.stubbed(StubTransport(status: status, json: json))
            .uploadMedia(sha256: Self.sha, data: Data("a photo".utf8), contentType: .jpeg)
    }

    @Test("a new blob answers 201 as a fresh store")
    func createdIsFresh() async throws {
        let result = try await upload(
            status: .created,
            json: "{\"sha256\":\"\(Self.sha)\",\"alreadyStored\":false}"
        )
        #expect(result == InventoryMediaUploadResult(sha256: Self.sha, alreadyStored: false))
    }

    @Test("re-sending the same bytes answers 200 as already stored, not an error")
    func alreadyStoredIsSuccess() async throws {
        let result = try await upload(
            status: .ok,
            json: "{\"sha256\":\"\(Self.sha)\",\"alreadyStored\":true}"
        )
        #expect(result == InventoryMediaUploadResult(sha256: Self.sha, alreadyStored: true))
    }

    @Test("413 is thrown as a transport failure a caller can catch, not a crash")
    func contentTooLargeThrows() async {
        await #expect(throws: RepositoryError.self) {
            _ = try await self.upload(
                status: .contentTooLarge,
                json:
                    "{\"code\":\"payload_too_large\",\"maxBytes\":8388608,\"message\":\"too big\"}"
            )
        }
    }

    @Test("415 is thrown distinctly from a payload that was simply too large")
    func unsupportedMediaTypeThrows() async {
        do {
            _ = try await upload(
                status: .unsupportedMediaType,
                json: "{\"code\":\"upstream_unsupported_media\",\"pillar\":\"inventory\","
                    + "\"retryable\":false,\"message\":\"no\"}"
            )
            Issue.record("expected a thrown error")
        } catch let error as RepositoryError {
            guard case .transport(let message) = error else {
                Issue.record("expected .transport, got \(error)")
                return
            }
            #expect(message.contains("unsupported media type"))
        } catch {
            Issue.record("expected a RepositoryError, got \(error)")
        }
    }

    @Test("fetching a variant sends it on the query string")
    func variantIsSent() async throws {
        let stub = StubTransport(
            status: .ok,
            json:
                "{\"sha256\":\"\(Self.sha)\",\"mediaType\":\"image/jpeg\",\"byteLength\":3,"
                + "\"dataBase64\":\"\(Data("abc".utf8).base64EncodedString())\"}"
        )
        let data = try await BFMInventoryTransport.stubbed(stub)
            .fetchMedia(sha256: Self.sha, variant: .medium)

        #expect(data == Data("abc".utf8))
        let sent = await stub.recorded.all
        #expect(sent.first?.request.path?.contains("variant=medium") == true)
    }

    @Test("a 404 on fetch is a fact about the hash, not a contract mismatch")
    func fetchNotFound() async {
        await #expect(throws: RepositoryError.self) {
            _ = try await BFMInventoryTransport.stubbed(
                StubTransport(
                    status: .notFound,
                    json: "{\"code\":\"not_found\",\"pillar\":\"inventory\",\"retryable\":false,"
                        + "\"message\":\"no\"}")
            ).fetchMedia(sha256: Self.sha, variant: .thumb)
        }
    }
}
