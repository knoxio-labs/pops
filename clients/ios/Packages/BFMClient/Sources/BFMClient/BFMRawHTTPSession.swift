import Foundation

/// The three shapes of raw request the document byte routes make, as a seam
/// tests answer without `URLProtocol`.
internal protocol BFMRawHTTPSession: Sendable {
    /// Streams the file at `fileURL` as the body and answers the response's body.
    func upload(_ request: URLRequest, fromFile fileURL: URL) async throws -> (
        HTTPURLResponse, Data
    )

    /// Writes the body to a temporary file the caller owns.
    func download(_ request: URLRequest) async throws -> (HTTPURLResponse, URL)

    /// The response's headers. A successful body is not read; a refusal's
    /// body is, up to a bound, so its message survives.
    func headers(for request: URLRequest) async throws -> (HTTPURLResponse, Data)
}

extension URLSession: BFMRawHTTPSession {
    private static let refusalBodyLimit = 64 * 1024

    internal func upload(_ request: URLRequest, fromFile fileURL: URL) async throws -> (
        HTTPURLResponse, Data
    ) {
        let (data, response) = try await upload(for: request, fromFile: fileURL)
        return (try Self.http(response), data)
    }

    internal func download(_ request: URLRequest) async throws -> (HTTPURLResponse, URL) {
        let (location, response) = try await download(for: request)
        // The system may reclaim its own temporary location once this call
        // returns, so it moves to one the caller owns first.
        let owned = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.moveItem(at: location, to: owned)
        return (try Self.http(response), owned)
    }

    internal func headers(for request: URLRequest) async throws -> (HTTPURLResponse, Data) {
        let (bytes, response) = try await bytes(for: request)
        let http = try Self.http(response)
        guard !(200..<300).contains(http.statusCode) else {
            bytes.task.cancel()
            return (http, Data())
        }
        var body = Data()
        for try await byte in bytes {
            body.append(byte)
            if body.count == Self.refusalBodyLimit { break }
        }
        bytes.task.cancel()
        return (http, body)
    }

    private static func http(_ response: URLResponse) throws -> HTTPURLResponse {
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        return http
    }
}
