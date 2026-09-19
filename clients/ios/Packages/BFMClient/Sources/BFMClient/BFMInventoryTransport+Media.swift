import AppCore
import Foundation
import OpenAPIRuntime

extension BFMInventoryTransport {
    /// `PUT /mobile/inventory/media/:sha256` (A22, ADR-002 D9): stores a
    /// photo's bytes ahead of the `item.attachPhoto` mutation that
    /// references them. `200` and `201` both answer the same shape
    /// (`alreadyStored` tells them apart); re-sending the same bytes is
    /// naturally idempotent, so both are read as success rather than only
    /// `201`.
    public func uploadMedia(
        sha256: String, data: Data, contentType: InventoryMediaContentType
    ) async throws -> InventoryMediaUploadResult {
        let output: PutMedia.Output
        do {
            output = try await client.generated.mobileInventory_putMedia(
                path: .init(sha256: sha256),
                body: .json(
                    .init(dataBase64: data.base64EncodedString(), mediaType: Self.wire(contentType))
                )
            )
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: PutMedia.id)
        }

        switch output {
        case .ok(let ok):
            let payload = try ok.body.json
            return InventoryMediaUploadResult(
                sha256: payload.sha256, alreadyStored: payload.alreadyStored)
        case .created(let created):
            let payload = try created.body.json
            return InventoryMediaUploadResult(
                sha256: payload.sha256, alreadyStored: payload.alreadyStored)
        case .contentTooLarge:
            throw BFMInventoryFailureMapping.repositoryError(
                for: .payloadTooLarge, operation: PutMedia.id)
        case .unsupportedMediaType:
            throw BFMInventoryFailureMapping.repositoryError(
                for: .unsupportedMediaType, operation: PutMedia.id)
        default:
            throw try Self.commonFailure(output, operation: PutMedia.id)
        }
    }

    fileprivate static func commonFailure(_ output: PutMedia.Output, operation: String) throws
        -> RepositoryError
    {
        switch output {
        case .badRequest:
            return BFMInventoryFailureMapping.repositoryError(
                for: .badRequest, operation: operation)
        case .unauthorized:
            return BFMInventoryFailureMapping.repositoryError(
                for: .unauthorized, operation: operation)
        case .forbidden(let forbidden):
            return Self.forbiddenFailure(try forbidden.body.json, operation: operation)
        case .tooManyRequests:
            return BFMInventoryFailureMapping.repositoryError(
                for: .rateLimited, operation: operation)
        case .badGateway(let upstream):
            return BFMInventoryFailureMapping.repositoryError(
                for: .upstream(code: try upstream.body.json.code.rawValue), operation: operation)
        case .serviceUnavailable(let upstream):
            return BFMInventoryFailureMapping.repositoryError(
                for: .upstream(code: try upstream.body.json.code.rawValue), operation: operation)
        case .undocumented(let status, _):
            return BFMInventoryFailureMapping.repositoryError(
                for: .undocumented(status), operation: operation)
        case .ok, .created, .contentTooLarge, .unsupportedMediaType:
            preconditionFailure("handled by the caller's own switch")
        }
    }

    /// The read half of ``uploadMedia(sha256:data:contentType:)``. `404`
    /// answers "this build's replica references bytes the server no longer
    /// has" rather than a contract mismatch, on the same reasoning
    /// `fetchItemEvents`' own 404 does.
    public func fetchMedia(sha256: String, variant: InventoryPhotoVariant) async throws -> Data {
        let output: GetMedia.Output
        do {
            output = try await client.generated.mobileInventory_getMedia(
                path: .init(sha256: sha256), query: .init(variant: Self.wire(variant))
            )
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: GetMedia.id)
        }

        switch output {
        case .ok(let ok):
            let payload = try ok.body.json
            guard let data = Data(base64Encoded: payload.dataBase64) else {
                throw RepositoryError.contractMismatch
            }
            return data
        case .notFound:
            throw RepositoryError.transport("\(GetMedia.id): media not found")
        case .badRequest:
            throw BFMInventoryFailureMapping.repositoryError(
                for: .badRequest, operation: GetMedia.id)
        case .unauthorized:
            throw BFMInventoryFailureMapping.repositoryError(
                for: .unauthorized, operation: GetMedia.id)
        case .forbidden(let forbidden):
            throw Self.forbiddenFailure(try forbidden.body.json, operation: GetMedia.id)
        case .tooManyRequests:
            throw BFMInventoryFailureMapping.repositoryError(
                for: .rateLimited, operation: GetMedia.id)
        case .badGateway(let upstream):
            throw BFMInventoryFailureMapping.repositoryError(
                for: .upstream(code: try upstream.body.json.code.rawValue), operation: GetMedia.id)
        case .serviceUnavailable(let upstream):
            throw BFMInventoryFailureMapping.repositoryError(
                for: .upstream(code: try upstream.body.json.code.rawValue), operation: GetMedia.id)
        case .undocumented(let status, _):
            throw BFMInventoryFailureMapping.repositoryError(
                for: .undocumented(status), operation: GetMedia.id)
        }
    }

    private static func wire(
        _ contentType: InventoryMediaContentType
    ) -> PutMedia.Input.Body.JsonPayload.MediaTypePayload {
        switch contentType {
        case .jpeg: .imageJpeg
        case .heic: .imageHeic
        }
    }

    private static func wire(
        _ variant: InventoryPhotoVariant
    ) -> GetMedia.Input.Query.VariantPayload {
        switch variant {
        case .thumb: .thumb
        case .medium: .medium
        case .full: .full
        }
    }
}

private typealias PutMedia = Operations.MobileInventory_putMedia
private typealias GetMedia = Operations.MobileInventory_getMedia
