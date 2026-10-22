import AppCore
import Foundation
import OpenAPIRuntime

/// An item's Paperless documents through bfm's `/mobile/inventory` routes.
///
/// The list, edit, unlink and dismiss routes are in the contract and go
/// through the generated client. The upload and the file download carry raw
/// bytes the contract cannot describe, so they are `URLRequest`s carrying the
/// same device credential through ``BFMRawAuthorization``, as Ego's stream
/// does. The upload streams from a file and the download lands in one; no
/// document is ever held in memory whole.
public struct BFMInventoryDocumentsRepository: InventoryDocumentsService {
    private let client: BFMHTTPClient
    private let authorization: BFMRawAuthorization
    private let session: any BFMRawHTTPSession

    /// - Parameters:
    ///   - client: The authenticated generated client.
    ///   - baseURL: The paired BFM's origin, for the raw routes.
    ///   - authorizer: The refresher the client's middleware also holds.
    public init(client: BFMHTTPClient, baseURL: URL, authorizer: any BFMStreamAuthorizer) {
        self.init(
            client: client, baseURL: baseURL, authorizer: authorizer,
            session: client.urlSession ?? URLSession(configuration: .ephemeral))
    }

    internal init(
        client: BFMHTTPClient, baseURL: URL, authorizer: any BFMStreamAuthorizer,
        session: any BFMRawHTTPSession
    ) {
        self.client = client
        authorization = BFMRawAuthorization(baseURL: baseURL, authorizer: authorizer)
        self.session = session
    }

    public func documents(of itemId: InventoryItem.ID) async throws -> InventoryItemDocuments {
        let output: List.Output
        do {
            output = try await client.generated.mobileInventory_listItemDocuments(
                path: .init(id: itemId))
        } catch let error as ClientError {
            throw Self.failure(error, operation: List.id)
        }
        guard case .ok(let ok) = output else { throw Self.unexpected(List.id) }
        let payload = try ok.body.json
        return InventoryItemDocuments(
            limits: InventoryDocumentUploadLimits(
                maxUploadBytes: payload.maxUploadBytes,
                allowedMimeTypes: payload.allowedMimeTypes),
            linked: payload.linked.map {
                InventoryLinkedDocument(
                    id: $0.id, paperlessDocumentId: $0.paperlessDocumentId,
                    kind: InventoryDocumentKind(wire: $0.documentType), title: $0.title,
                    presence: presence(of: $0))
            },
            pending: payload.pending.map(ingestion(from:)),
            failed: payload.failed.map(ingestion(from:)))
    }

    public func updateDocument(_ id: InventoryLinkedDocument.ID, _ edit: InventoryDocumentEdit)
        async throws
    {
        let body = Update.Input.Body.JsonPayload(
            documentType: edit.kind.flatMap { .init(rawValue: $0.rawValue) }, title: edit.title)
        let output: Update.Output
        do {
            output = try await client.generated.mobileInventory_updateItemDocument(
                path: .init(id: id), body: .json(body))
        } catch let error as ClientError {
            throw Self.failure(error, operation: Update.id)
        }
        guard case .ok = output else { throw Self.unexpected(Update.id) }
    }

    public func unlinkDocument(_ id: InventoryLinkedDocument.ID) async throws {
        let output: Unlink.Output
        do {
            output = try await client.generated.mobileInventory_unlinkItemDocument(
                path: .init(id: id))
        } catch let error as ClientError {
            throw Self.failure(error, operation: Unlink.id)
        }
        guard case .ok = output else { throw Self.unexpected(Unlink.id) }
    }

    public func dismissIngestion(_ id: InventoryDocumentIngestion.ID) async throws {
        let output: Dismiss.Output
        do {
            output = try await client.generated.mobileInventory_dismissDocumentIngestion(
                path: .init(id: id))
        } catch let error as ClientError {
            throw Self.failure(error, operation: Dismiss.id)
        }
        guard case .ok = output else { throw Self.unexpected(Dismiss.id) }
    }

    public func upload(_ upload: InventoryDocumentUpload, to itemId: InventoryItem.ID)
        async throws -> InventoryDocumentIngestion
    {
        var query = [
            URLQueryItem(name: "documentType", value: upload.kind.rawValue),
            URLQueryItem(name: "fileName", value: upload.fileName),
        ]
        if let title = upload.title { query.append(URLQueryItem(name: "title", value: title)) }
        var request = URLRequest(
            url: url(["mobile", "inventory", "items", itemId, "documents"], query: query))
        request.httpMethod = "POST"
        request.setValue(upload.mimeType, forHTTPHeaderField: "Content-Type")
        request.setValue(String(upload.byteCount), forHTTPHeaderField: "Content-Length")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let exchange = try await raw {
            try await session.upload(Self.authorized(request, $0), fromFile: upload.fileURL)
        } discard: { _ in
        }
        try await check(exchange, body: exchange.payload, accepting: [202])
        do {
            let wire = try JSONDecoder().decode(
                WireDocumentIngestionBody.self, from: exchange.payload)
            return ingestion(from: wire)
        } catch {
            throw RepositoryError.contractMismatch
        }
    }

    public func fileVersion(of id: InventoryLinkedDocument.ID) async throws
        -> InventoryDocumentFileVersion
    {
        var request = URLRequest(url: fileURL(id))
        request.setValue("bytes=0-0", forHTTPHeaderField: "Range")
        let exchange = try await raw {
            try await session.headers(for: Self.authorized(request, $0))
        } discard: { _ in
        }
        try await check(exchange, body: exchange.payload, accepting: [200, 206])
        guard let version = BFMDocumentFileHeaders.version(of: exchange.response) else {
            throw RepositoryError.contractMismatch
        }
        return version
    }

    public func downloadFile(of id: InventoryLinkedDocument.ID) async throws -> (
        temporaryURL: URL, version: InventoryDocumentFileVersion
    ) {
        let request = URLRequest(url: fileURL(id))
        let exchange = try await raw {
            try await session.download(Self.authorized(request, $0))
        } discard: {
            try? FileManager.default.removeItem(at: $0)
        }
        let temporaryURL = exchange.payload
        guard exchange.response.statusCode == 200 else {
            let body = (try? Data(contentsOf: temporaryURL)) ?? Data()
            try? FileManager.default.removeItem(at: temporaryURL)
            try await check(exchange, body: body, accepting: [200])
            throw RepositoryError.contractMismatch
        }
        guard let version = BFMDocumentFileHeaders.version(of: exchange.response) else {
            try? FileManager.default.removeItem(at: temporaryURL)
            throw RepositoryError.contractMismatch
        }
        return (temporaryURL, version)
    }

    private func raw<Payload: Sendable>(
        _ send: (String?) async throws -> (HTTPURLResponse, Payload),
        discard: (Payload) async -> Void
    ) async throws -> BFMRawAuthorization.Exchange<Payload> {
        do {
            return try await authorization.exchange(send, discard: discard)
        } catch let error as URLError {
            throw Self.failure(error)
        }
    }

    /// Returns when the status is one `accepting` names; otherwise throws
    /// what the refusal means, ending the session first on a revocation.
    private func check<Payload>(
        _ exchange: BFMRawAuthorization.Exchange<Payload>, body: Data, accepting: Set<Int>
    ) async throws {
        let status = exchange.response.statusCode
        guard !accepting.contains(status) else { return }
        await authorization.noteRefusal(
            status: status, body: body, credential: exchange.credential)
        let envelope = try? JSONDecoder().decode(WireDocumentRefusal.self, from: body)
        throw BFMDocumentsFailure.error(status: status, message: envelope?.message)
            ?? RepositoryError.transport("inventory documents: status \(status)")
    }

    private func url(_ components: [String], query: [URLQueryItem] = []) -> URL {
        var url = authorization.baseURL
        for component in components { url.append(path: component) }
        if !query.isEmpty { url.append(queryItems: query) }
        return url
    }

    private func fileURL(_ id: InventoryLinkedDocument.ID) -> URL {
        url(["mobile", "inventory", "documents", String(id), "file"])
    }

    private static func authorized(_ request: URLRequest, _ accessToken: String?) -> URLRequest {
        var request = request
        BFMRawAuthorization.authorize(&request, accessToken: accessToken)
        return request
    }

    private static func failure(_ error: ClientError, operation: String) -> any Error {
        guard let details = PopsError.runtimeFailureDetails(from: error) else {
            return BFMRepositoryFailure.failure(error, operation: operation)
        }
        if details.popsError.kind == .offline || details.popsError.kind == .timeout {
            return InventoryDocumentsError.offline
        }
        if let status = details.statusCode,
            let mapped = BFMDocumentsFailure.error(
                status: status, message: details.popsError.message)
        {
            return mapped
        }
        return BFMRepositoryFailure.failure(error, operation: operation)
    }

    private static func failure(_ error: URLError) -> any Error {
        switch error.code {
        case .cancelled: CancellationError()
        default: InventoryDocumentsError.offline
        }
    }

    private static func unexpected(_ operation: String) -> RepositoryError {
        .transport("\(operation): unexpected response")
    }
}

private typealias List = Operations.MobileInventory_listItemDocuments
private typealias Update = Operations.MobileInventory_updateItemDocument
private typealias Unlink = Operations.MobileInventory_unlinkItemDocument
private typealias Dismiss = Operations.MobileInventory_dismissDocumentIngestion
