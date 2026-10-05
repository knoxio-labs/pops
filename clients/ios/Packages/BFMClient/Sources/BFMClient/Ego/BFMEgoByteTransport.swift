import Foundation

/// Supplies the device credential and the existing refresh/revocation actions to Ego's stream.
public protocol BFMStreamAuthorizer: Sendable {
    /// Returns the current access token, or `nil` when the device has no usable session.
    func currentAccessToken() async -> String?

    /// Rotates a rejected token through the caller's existing session refresher.
    func refreshedAccessToken(replacing staleAccessToken: String, at baseURL: URL) async throws
        -> String

    /// Reports the BFM's explicit device-revocation response to the existing session owner.
    func deviceWasRevoked() async
}

internal protocol BFMByteSource: Sendable {
    func open(_ request: URLRequest) async throws -> (
        HTTPURLResponse, AsyncThrowingStream<[UInt8], any Error>
    )
}

/// Turns URLSession's byte sequence into bounded-size chunks while preserving cancellation.
internal struct URLSessionByteSource: BFMByteSource {
    private static let chunkSize = 4096

    private let session: URLSession

    internal init(session: URLSession = .shared) {
        self.session = session
    }

    internal func open(_ request: URLRequest) async throws -> (
        HTTPURLResponse, AsyncThrowingStream<[UInt8], any Error>
    ) {
        let (bytes, response) = try await session.bytes(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw BFMByteSourceError.nonHTTPResponse
        }

        let stream = AsyncThrowingStream<[UInt8], any Error> { continuation in
            let reader = Task {
                var chunk: [UInt8] = []
                chunk.reserveCapacity(Self.chunkSize)

                do {
                    for try await byte in bytes {
                        try Task.checkCancellation()
                        chunk.append(byte)
                        if chunk.count == Self.chunkSize {
                            if case .terminated = continuation.yield(chunk) {
                                return
                            }
                            chunk.removeAll(keepingCapacity: true)
                        }
                    }

                    if !chunk.isEmpty {
                        if case .terminated = continuation.yield(chunk) {
                            return
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }

            continuation.onTermination = { termination in
                if case .cancelled = termination {
                    reader.cancel()
                }
            }
        }

        return (httpResponse, stream)
    }
}

internal enum BFMEgoStreamOpening: Sendable {
    case streaming(AsyncThrowingStream<[UInt8], any Error>)
    case rejected(status: Int, retryAfterSeconds: Int?, body: Data)
}

internal struct BFMEgoByteTransport: Sendable {
    private static let rejectedBodyLimit = 64 * 1024

    private let baseURL: URL
    private let authorizer: any BFMStreamAuthorizer
    private let source: any BFMByteSource

    internal init(
        baseURL: URL,
        authorizer: any BFMStreamAuthorizer,
        source: any BFMByteSource = URLSessionByteSource()
    ) {
        self.baseURL = baseURL
        self.authorizer = authorizer
        self.source = source
    }

    internal func open(body: Data) async throws -> BFMEgoStreamOpening {
        let accessToken = await authorizer.currentAccessToken()
        let (response, bytes) = try await source.open(
            request(body: body, accessToken: accessToken))

        if response.statusCode == 401, let accessToken {
            _ = await Self.readBody(from: bytes, upTo: Self.rejectedBodyLimit)
            let refreshedToken = try await authorizer.refreshedAccessToken(
                replacing: accessToken,
                at: baseURL
            )
            let (retryResponse, retryBytes) = try await source.open(
                request(body: body, accessToken: refreshedToken))
            return await opening(
                for: retryResponse,
                bytes: retryBytes,
                tokens: [accessToken, refreshedToken]
            )
        }

        return await opening(for: response, bytes: bytes, tokens: [accessToken].compactMap { $0 })
    }

    private func request(body: Data, accessToken: String?) -> URLRequest {
        var url = baseURL
        for component in ["mobile", "ego", "chat", "stream"] {
            url.append(path: component)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        if let accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func opening(
        for response: HTTPURLResponse,
        bytes: AsyncThrowingStream<[UInt8], any Error>,
        tokens: [String]
    ) async -> BFMEgoStreamOpening {
        guard response.statusCode != 200 else {
            return .streaming(bytes)
        }

        let body = await Self.readBody(from: bytes, upTo: Self.rejectedBodyLimit)
        if response.statusCode == 403, Self.isDeviceRevocation(body) {
            await authorizer.deviceWasRevoked()
        }

        let safeBody = Self.redact(tokens: tokens, from: body)
        let retryAfter = response.value(forHTTPHeaderField: "Retry-After")
            .flatMap { Int($0.trimmingCharacters(in: .whitespacesAndNewlines)) }
            .flatMap { $0 >= 0 ? $0 : nil }
        return .rejected(status: response.statusCode, retryAfterSeconds: retryAfter, body: safeBody)
    }

    private static func readBody(
        from bytes: AsyncThrowingStream<[UInt8], any Error>,
        upTo limit: Int
    ) async -> Data {
        var body = Data()
        do {
            for try await chunk in bytes {
                let remaining = limit - body.count
                if remaining > 0 {
                    body.append(contentsOf: chunk.prefix(remaining))
                }
                if body.count == limit {
                    break
                }
            }
        } catch {
            // The HTTP status remains actionable even when an intermediary truncates its body.
        }
        return body
    }

    private static func isDeviceRevocation(_ body: Data) -> Bool {
        guard let refusal = try? JSONDecoder().decode(BFMEgoForbiddenResponse.self, from: body)
        else {
            return false
        }
        return refusal.code == "bfm.auth.device_revoked" || refusal.code == "device_revoked"
    }

    private static func redact(tokens: [String], from body: Data) -> Data {
        let secrets = tokens.filter { !$0.isEmpty }.map { Array($0.utf8) }
        guard !secrets.isEmpty else {
            return body
        }

        let bytes = Array(body)
        var safeBytes: [UInt8] = []
        safeBytes.reserveCapacity(bytes.count)
        var index = 0
        while index < bytes.count {
            if let secret = secrets.first(where: { secret in
                let end = index + secret.count
                return end <= bytes.count && bytes[index..<end].elementsEqual(secret)
            }) {
                index += secret.count
            } else {
                safeBytes.append(bytes[index])
                index += 1
            }
        }
        return Data(safeBytes)
    }
}

private struct BFMEgoForbiddenResponse: Decodable {
    let code: String?
}

private enum BFMByteSourceError: Error {
    case nonHTTPResponse
}
