import AppCore
import Foundation
import HTTPTypes
import Testing

@testable import BFMClient

@Suite("BFMPurchasesRepository receipt mapping")
internal struct PurchaseReceiptMappingTests {
    @Test("full receipt bytes and media type cross the envelope")
    func mapsFullReceipt() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(status: .ok, json: Self.receiptJSON))

        let image = try #require(try await repository.receiptImage(sha256: "abc"))

        #expect(image.mediaType == "image/png")
        #expect(image.data == Data([0xCA, 0xFE]))
    }

    @Test("missing receipt and unsupported thumbnail are answered absences")
    func absentReceiptResponses() async throws {
        let missing = try BFMPurchasesRepository.stubbed(
            StubTransport(status: .notFound, json: TransactionsWire.upstream(code: "not_found")))
        let unsupported = try BFMPurchasesRepository.stubbed(
            StubTransport(
                status: .unsupportedMediaType,
                json: TransactionsWire.upstream(code: "upstream_unsupported_media")))

        #expect(try await missing.receiptImage(sha256: "missing") == nil)
        #expect(try await unsupported.receiptThumbnail(sha256: "pdf") == nil)
    }

    @Test("malformed base64 is a contract mismatch for full and thumbnail reads")
    func malformedBase64() async throws {
        let malformed = Self.receiptJSON.replacingOccurrences(of: "yv4=", with: "%%%")
        let full = try BFMPurchasesRepository.stubbed(
            StubTransport(status: .ok, json: malformed))
        let thumbnail = try BFMPurchasesRepository.stubbed(
            StubTransport(status: .ok, json: malformed))

        await #expect(throws: RepositoryError.contractMismatch) {
            try await full.receiptImage(sha256: "abc")
        }
        await #expect(throws: RepositoryError.contractMismatch) {
            try await thumbnail.receiptThumbnail(sha256: "abc")
        }
    }

    @Test("receipt request errors are not mistaken for missing bytes")
    func receiptFailures() async throws {
        let invalid = try BFMPurchasesRepository.stubbed(
            StubTransport(
                status: .badRequest,
                json: TransactionsWire.failure(code: "invalid_request")))
        let undocumented = try BFMPurchasesRepository.stubbed(
            StubTransport(status: .init(code: 418), json: "{}"))

        await #expect(throws: RepositoryError.self) {
            try await invalid.receiptImage(sha256: "abc")
        }
        await #expect(throws: RepositoryError.self) {
            try await undocumented.receiptThumbnail(sha256: "abc")
        }
    }

    private static let receiptJSON =
        #"{"byteLength":2,"dataBase64":"yv4=","mediaType":"image/png","sha256":"abc"}"#
}
