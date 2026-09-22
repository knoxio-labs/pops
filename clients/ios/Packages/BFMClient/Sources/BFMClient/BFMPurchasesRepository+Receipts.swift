import AppCore
import Foundation
import OpenAPIRuntime

extension BFMPurchasesRepository {
    /// Reads a decoded receipt thumbnail, returning `nil` when absent or unsupported.
    public func receiptThumbnail(sha256: String) async throws -> ReceiptImage? {
        let output: GetReceiptThumbnail.Output
        do {
            output = try await client.generated.mobilePurchases_getReceiptThumbnail(
                path: .init(sha256: sha256))
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: GetReceiptThumbnail.id)
        }

        switch output {
        case .ok(let ok):
            let payload = try ok.body.json
            return try Self.receiptImage(
                mediaType: payload.mediaType, dataBase64: payload.dataBase64)
        case .notFound, .unsupportedMediaType: return nil
        case .badRequest:
            throw RepositoryError.transport("\(GetReceiptThumbnail.id): invalid request")
        case .unauthorized, .forbidden: throw RepositoryError.unauthorized
        case .tooManyRequests:
            throw RepositoryError.transport("\(GetReceiptThumbnail.id): rate limited")
        case .badGateway(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: GetReceiptThumbnail.id)
        case .serviceUnavailable(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: GetReceiptThumbnail.id)
        case .undocumented(let statusCode, _):
            throw RepositoryError.transport(
                "\(GetReceiptThumbnail.id): undocumented status \(statusCode)")
        }
    }

    /// Reads a decoded full-size receipt, returning `nil` when it is absent.
    public func receiptImage(sha256: String) async throws -> ReceiptImage? {
        let output: GetReceipt.Output
        do {
            output = try await client.generated.mobilePurchases_getReceipt(
                path: .init(sha256: sha256))
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: GetReceipt.id)
        }

        switch output {
        case .ok(let ok):
            let payload = try ok.body.json
            return try Self.receiptImage(
                mediaType: payload.mediaType, dataBase64: payload.dataBase64)
        case .notFound: return nil
        case .badRequest:
            throw RepositoryError.transport("\(GetReceipt.id): invalid request")
        case .unauthorized, .forbidden: throw RepositoryError.unauthorized
        case .tooManyRequests:
            throw RepositoryError.transport("\(GetReceipt.id): rate limited")
        case .badGateway(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: GetReceipt.id)
        case .serviceUnavailable(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: GetReceipt.id)
        case .undocumented(let statusCode, _):
            throw RepositoryError.transport("\(GetReceipt.id): undocumented status \(statusCode)")
        }
    }

    private static func receiptImage(mediaType: String, dataBase64: String) throws -> ReceiptImage {
        guard let data = Data(base64Encoded: dataBase64) else {
            throw RepositoryError.contractMismatch
        }
        return ReceiptImage(mediaType: mediaType, data: data)
    }
}

private typealias GetReceipt = Operations.MobilePurchases_getReceipt
private typealias GetReceiptThumbnail = Operations.MobilePurchases_getReceiptThumbnail
