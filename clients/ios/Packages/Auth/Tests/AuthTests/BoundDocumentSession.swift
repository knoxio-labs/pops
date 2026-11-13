import Foundation

@testable import BFMClient

internal actor BoundDocumentSession: BFMRawHTTPSession {
    nonisolated internal let directory: URL
    internal private(set) var requests: [URLRequest] = []
    private var statuses: [Int]
    private var refusedFiles: [URL] = []
    private let beforeResponse: @Sendable () async -> Void

    internal init(_ statuses: [Int], beforeResponse: @escaping @Sendable () async -> Void = {})
        throws
    {
        self.statuses = statuses
        self.beforeResponse = beforeResponse
        directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    internal func download(_ request: URLRequest) async throws -> (HTTPURLResponse, URL) {
        requests.append(request)
        guard !statuses.isEmpty, let url = request.url else { throw URLError(.badServerResponse) }
        let status = statuses.removeFirst()
        let file = directory.appendingPathComponent(UUID().uuidString)
        let body = status == 403 ? #"{"code":"bfm.auth.device_revoked"}"# : "original"
        try Data(body.utf8).write(to: file)
        if status != 200 { refusedFiles.append(file) }
        await beforeResponse()
        guard
            let response = HTTPURLResponse(
                url: url, statusCode: status, httpVersion: nil,
                headerFields: ["Content-Type": "text/plain"])
        else { throw URLError(.badServerResponse) }
        return (response, file)
    }

    internal func discardedRefusals() -> Bool {
        !refusedFiles.isEmpty
            && refusedFiles.allSatisfy { !FileManager.default.fileExists(atPath: $0.path) }
    }

    internal func upload(_ request: URLRequest, fromFile fileURL: URL) async throws -> (
        HTTPURLResponse, Data
    ) {
        throw URLError(.unsupportedURL)
    }

    internal func headers(for request: URLRequest) async throws -> (HTTPURLResponse, Data) {
        throw URLError(.unsupportedURL)
    }
}
