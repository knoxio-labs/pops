import AppCore
import Foundation
import HTTPTypes
import Testing

@testable import BFMClient

/// A `BFMRawHTTPSession` that answers from a script and records each request.
internal actor ScriptedRawSession: BFMRawHTTPSession {
    internal struct Reply: Sendable {
        internal let status: Int
        internal let headers: [String: String]
        internal let body: Data

        internal init(_ status: Int, headers: [String: String] = [:], body: String = "") {
            self.status = status
            self.headers = headers
            self.body = Data(body.utf8)
        }
    }

    internal struct Recorded: Sendable {
        internal let request: URLRequest
        internal let kind: String
        internal let fileURL: URL?
    }

    private var replies: [Reply]
    internal private(set) var recorded: [Recorded] = []
    private let failure: URLError?

    internal init(_ replies: [Reply], failure: URLError? = nil) {
        self.replies = replies
        self.failure = failure
    }

    private func next(_ request: URLRequest, kind: String, fileURL: URL? = nil) throws -> (
        HTTPURLResponse, Data
    ) {
        recorded.append(Recorded(request: request, kind: kind, fileURL: fileURL))
        if let failure { throw failure }
        let reply = replies.removeFirst()
        guard let url = request.url,
            let response = HTTPURLResponse(
                url: url, statusCode: reply.status, httpVersion: "HTTP/1.1",
                headerFields: reply.headers)
        else { throw URLError(.badURL) }
        return (response, reply.body)
    }

    internal func upload(_ request: URLRequest, fromFile fileURL: URL) async throws -> (
        HTTPURLResponse, Data
    ) {
        try next(request, kind: "upload", fileURL: fileURL)
    }

    internal func download(_ request: URLRequest) async throws -> (HTTPURLResponse, URL) {
        let (response, body) = try next(request, kind: "download")
        let url = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try body.write(to: url)
        return (response, url)
    }

    internal func headers(for request: URLRequest) async throws -> (HTTPURLResponse, Data) {
        let (response, body) = try next(request, kind: "headers")
        return (response, (200..<300).contains(response.statusCode) ? Data() : body)
    }
}

internal enum DocumentsRepositoryFixture {
    /// The pending ingestion an accepted upload answers.
    static func ingestion(fileName: String) -> String {
        """
        {"id":12,"documentType":"receipt","title":null,"fileName":"\(fileName)",\
        "state":"pending","reason":null,"createdAt":"x"}
        """
    }

    static let base = URL(string: "https://bfm.example")

    static func repository(
        _ transport: StubTransport = StubTransport(status: .ok, json: "{}"),
        session: ScriptedRawSession = ScriptedRawSession([]),
        authorizer: RecordingBFMStreamAuthorizer = RecordingBFMStreamAuthorizer(
            accessToken: "access-1")
    ) throws -> BFMInventoryDocumentsRepository {
        let base = try #require(base)
        return BFMInventoryDocumentsRepository(
            client: BFMHTTPClient(baseURL: base, transport: transport), baseURL: base,
            authorizer: authorizer, session: session)
    }

    static let upload = InventoryDocumentUpload(
        fileURL: URL(filePath: "/tmp/a.pdf"), mimeType: "application/pdf", fileName: "a.pdf",
        byteCount: 10, kind: .receipt, title: nil)
}

internal actor BodyRecorder {
    private(set) var all: [Data] = []
    func append(_ data: Data) { all.append(data) }
}
