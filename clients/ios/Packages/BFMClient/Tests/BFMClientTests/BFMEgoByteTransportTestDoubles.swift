import Foundation

@testable import BFMClient

internal actor ScriptedBFMByteSource: BFMByteSource {
    internal struct Reply: Sendable {
        internal let statusCode: Int
        internal let headers: [String: String]
        internal let body: Data

        internal init(statusCode: Int, headers: [String: String] = [:], body: Data = Data()) {
            self.statusCode = statusCode
            self.headers = headers
            self.body = body
        }
    }

    internal struct RecordedRequest: Sendable {
        internal let url: URL?
        internal let method: String?
        internal let authorization: String?
        internal let contentType: String?
        internal let accept: String?
        internal let body: Data?
    }

    internal enum Failure: Error, Equatable {
        case unexpectedRequest
        case invalidResponse
    }

    private var replies: [Reply]
    private var requests: [RecordedRequest] = []

    internal init(replies: [Reply]) {
        self.replies = replies
    }

    internal func open(_ request: URLRequest) async throws -> (
        HTTPURLResponse, AsyncThrowingStream<[UInt8], any Error>
    ) {
        requests.append(
            RecordedRequest(
                url: request.url,
                method: request.httpMethod,
                authorization: request.value(forHTTPHeaderField: "Authorization"),
                contentType: request.value(forHTTPHeaderField: "Content-Type"),
                accept: request.value(forHTTPHeaderField: "Accept"),
                body: request.httpBody
            ))
        guard !replies.isEmpty else {
            throw Failure.unexpectedRequest
        }
        let reply = replies.removeFirst()
        guard let url = request.url,
            let response = HTTPURLResponse(
                url: url,
                statusCode: reply.statusCode,
                httpVersion: nil,
                headerFields: reply.headers
            )
        else {
            throw Failure.invalidResponse
        }
        return (response, Self.byteStream(reply.body))
    }

    internal func recordedRequests() -> [RecordedRequest] {
        requests
    }

    private static func byteStream(_ data: Data) -> AsyncThrowingStream<[UInt8], any Error> {
        AsyncThrowingStream { continuation in
            let chunkSize = 1024
            var start = 0
            while start < data.count {
                let end = min(start + chunkSize, data.count)
                continuation.yield(Array(data[start..<end]))
                start = end
            }
            continuation.finish()
        }
    }
}

internal actor RecordingBFMStreamAuthorizer: BFMStreamAuthorizer {
    internal enum RefreshBehavior: Sendable {
        case returns(String)
        case fails
    }

    internal struct RefreshCall: Equatable, Sendable {
        internal let staleAccessToken: String
        internal let baseURL: URL
    }

    private let accessToken: String?
    private let refreshBehavior: RefreshBehavior
    private var refreshes: [RefreshCall] = []
    private var revocations = 0

    internal init(accessToken: String?, refreshBehavior: RefreshBehavior = .returns("access-2")) {
        self.accessToken = accessToken
        self.refreshBehavior = refreshBehavior
    }

    internal func currentAccessToken() async -> String? {
        accessToken
    }

    internal func refreshedAccessToken(replacing staleAccessToken: String, at baseURL: URL)
        async throws -> String
    {
        refreshes.append(RefreshCall(staleAccessToken: staleAccessToken, baseURL: baseURL))
        switch refreshBehavior {
        case .returns(let accessToken):
            return accessToken
        case .fails:
            throw StreamAuthorizerTestFailure.refreshFailed
        }
    }

    internal func deviceWasRevoked() async {
        revocations += 1
    }

    internal func recordedRefreshes() -> [RefreshCall] {
        refreshes
    }

    internal func revocationCount() -> Int {
        revocations
    }
}

internal enum StreamAuthorizerTestFailure: Error, Equatable {
    case refreshFailed
}
