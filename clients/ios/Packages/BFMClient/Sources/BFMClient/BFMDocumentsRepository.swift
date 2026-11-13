import AppCore
import Foundation
import OpenAPIRuntime

/// Reads Documents-owned originals through their authenticated BFM routes, independently of trip grants.
public struct BFMDocumentsRepository: DocumentsReading {
    private let client: BFMHTTPClient
    private let files: BFMDocumentsFileReader

    /// Uses the paired origin and existing credential refresher for streamed original-file reads.
    /// Retained paired clients supply both expectedDevice and an owner-bound authorizer; nil preserves
    /// legacy unbound behavior.
    public init(
        client: BFMHTTPClient, baseURL: URL, authorizer: any BFMStreamAuthorizer,
        expectedDevice: PairedDevice? = nil
    ) {
        self.init(
            client: client, baseURL: baseURL, authorizer: authorizer,
            session: client.urlSession ?? URLSession(configuration: .ephemeral),
            expectedDevice: expectedDevice)
    }

    internal init(
        client: BFMHTTPClient, baseURL: URL, authorizer: any BFMStreamAuthorizer,
        session: any BFMRawHTTPSession, expectedDevice: PairedDevice? = nil
    ) {
        self.client = client
        files = BFMDocumentsFileReader(
            baseURL: baseURL, authorizer: authorizer, session: session,
            expectedDevice: expectedDevice)
    }

    /// Returns nil only for the owner's 404; configuration, grant and contract failures remain errors.
    public func document(id: Int) async throws -> DocumentOriginal? {
        guard id > 0 else { throw RepositoryError.requestRejected }
        guard let output = try await readOutput(id: id) else { return nil }
        return try original(output, id: id)
    }

    private func readOutput(id: Int) async throws -> Operations.MobileDocuments_getDocument.Output?
    {
        do {
            return try await client.generated.mobileDocuments_getDocument(path: .init(id: id))
        } catch let error as ClientError {
            switch BFMRepositoryFailure.statusCode(in: error) {
            case 404: return nil
            case 412: throw DocumentAccessError.notConfigured
            default: throw bfmReadFailure(error, operation: "mobileDocuments.getDocument")
            }
        }
    }

    private func original(
        _ output: Operations.MobileDocuments_getDocument.Output, id: Int
    ) throws -> DocumentOriginal? {
        switch output {
        case .ok(let ok):
            return try original(try ok.body.json, id: id)
        case .notFound: return nil
        case .preconditionFailed: throw DocumentAccessError.notConfigured
        case .unauthorized: throw RepositoryError.unauthorized
        case .forbidden(let value):
            throw BFMRepositoryFailure.forbiddenFailure(try value.body.json)
        case .tooManyRequests(let value):
            throw RepositoryError.rateLimited(
                retryAfterSeconds: try value.body.json.retryAfterSeconds)
        case .badGateway(let value):
            throw BFMRepositoryFailure.upstreamFailure(
                try value.body.json.code, operation: "mobileDocuments.getDocument")
        case .serviceUnavailable(let value):
            throw BFMRepositoryFailure.upstreamFailure(
                try value.body.json.code, operation: "mobileDocuments.getDocument")
        case .badRequest: throw RepositoryError.requestRejected
        case .undocumented: throw RepositoryError.contractMismatch
        }
    }

    private func original(
        _ value: Operations.MobileDocuments_getDocument.Output.Ok.Body.JsonPayload, id: Int
    ) throws -> DocumentOriginal {
        guard let sourceID = Int(exactly: value.id), sourceID == id else {
            throw RepositoryError.contractMismatch
        }
        return DocumentOriginal(
            id: sourceID, title: value.title, created: value.created,
            originalFileName: value.originalFileName, thumbnailUrl: value.thumbnailUrl)
    }

    /// Streams the original's bytes to a caller-owned temporary location; metadata alone never opens a file.
    public func file(id: Int) async throws -> DownloadedDocument { try await files.file(id: id) }
}
