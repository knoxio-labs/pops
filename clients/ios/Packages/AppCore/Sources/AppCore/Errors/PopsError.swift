import Foundation

/// A user-safe failure returned by the POPS federation or classified by the iOS client.
public struct PopsError: Error, Codable, Hashable, Sendable {
    /// The broad failure category used to choose recovery behaviour.
    public enum Kind: String, Codable, Hashable, Sendable {
        case offline
        case timeout
        case server
        case client
    }

    /// Stable machine-readable error code.
    public let code: String
    /// User-safe message supplied by the server or the iOS runtime.
    public let message: String
    /// Request identifier that correlates this failure with server logs.
    public let requestID: String?
    /// Whether retrying without changing the request may succeed.
    public let retryable: Bool
    /// Broad failure category used by presentation and recovery policy.
    public let kind: Kind

    /// Creates a user-safe POPS failure.
    public init(
        code: String,
        message: String,
        requestID: String? = nil,
        retryable: Bool,
        kind: Kind
    ) {
        self.code = code
        self.message = message
        self.requestID = requestID
        self.retryable = retryable
        self.kind = kind
    }

    private enum CodingKeys: String, CodingKey {
        case code
        case message
        case requestID = "requestId"
        case retryable
        case kind
    }
}

extension PopsError: LocalizedError {
    public var errorDescription: String? { message }
}

extension PopsError {
    /// Preserves a structured transport failure or safely classifies a legacy repository error.
    public init(repositoryError: RepositoryError, fallbackMessage: String) {
        if case .transport(let transport) = repositoryError, let popsError = transport.popsError {
            self = popsError
            return
        }

        switch repositoryError {
        case .unavailable:
            self.init(
                code: "ios.repository.unavailable", message: fallbackMessage,
                retryable: true, kind: .server)
        case .rateLimited:
            self.init(
                code: "ios.http.429", message: fallbackMessage,
                retryable: true, kind: .client)
        case .unauthorized:
            self.init(
                code: "ios.auth.unauthorized", message: fallbackMessage,
                retryable: false, kind: .client)
        case .contractMismatch:
            self.init(
                code: "ios.contract.mismatch", message: fallbackMessage,
                retryable: false, kind: .client)
        case .conflict:
            self.init(
                code: "ios.repository.conflict", message: fallbackMessage,
                retryable: false, kind: .client)
        case .transport:
            self.init(
                code: "ios.net.transport", message: fallbackMessage,
                retryable: true, kind: .server)
        case .dependencyNotBound:
            self.init(
                code: "ios.repository.unbound", message: fallbackMessage,
                retryable: false, kind: .client)
        }
    }
}
