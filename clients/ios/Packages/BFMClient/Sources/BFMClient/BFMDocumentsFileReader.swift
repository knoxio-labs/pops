import AppCore
import Foundation

internal struct BFMDocumentsFileReader: Sendable {
    private let authorization: BFMRawAuthorization
    private let session: any BFMRawHTTPSession

    internal init(
        baseURL: URL, authorizer: any BFMStreamAuthorizer, session: any BFMRawHTTPSession,
        expectedDevice: PairedDevice? = nil
    ) {
        authorization = BFMRawAuthorization(
            baseURL: baseURL, authorizer: authorizer, expectedDevice: expectedDevice)
        self.session = session
    }

    internal func file(id: Int) async throws -> DownloadedDocument {
        guard id > 0 else { throw RepositoryError.requestRejected }
        var url = authorization.baseURL
        for component in ["mobile", "documents", String(id), "file"] { url.append(path: component) }
        let request = URLRequest(url: url)
        let exchange: BFMRawAuthorization.Exchange<URL>
        do {
            exchange = try await authorization.exchange { token in
                var authenticated = request
                BFMRawAuthorization.authorize(&authenticated, accessToken: token)
                return try await session.download(authenticated)
            } discard: { location in
                try? FileManager.default.removeItem(at: location)
            }
        } catch let error as URLError {
            if error.code == .cancelled { throw CancellationError() }
            throw RepositoryError.transport(
                RepositoryTransportError(
                    popsError: error.code == .timedOut ? .timeout : .offline,
                    urlErrorCode: error.code))
        }
        let location = exchange.payload
        guard exchange.response.statusCode == 200 else {
            let body = (try? Data(contentsOf: location)) ?? Data()
            try? FileManager.default.removeItem(at: location)
            await authorization.noteRefusal(
                status: exchange.response.statusCode, body: body, credential: exchange.credential)
            throw documentFileFailure(response: exchange.response, body: body)
        }
        return DownloadedDocument(
            temporaryURL: location, metadata: BFMDocumentFileHeaders.metadata(of: exchange.response)
        )
    }
}
