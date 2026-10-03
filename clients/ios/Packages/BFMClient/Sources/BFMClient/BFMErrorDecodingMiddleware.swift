import AppCore
import Foundation
import HTTPTypes
import OpenAPIRuntime

internal struct BFMErrorDecodingMiddleware: ClientMiddleware {
    private static let maximumErrorBodyBytes = 1_048_576

    internal func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        let (response, responseBody) = try await next(request, body, baseURL)
        guard response.status.kind != .successful else { return (response, responseBody) }

        let requestID = Self.requestID(from: response)
        guard let responseBody else {
            throw BFMRuntimePopsError(
                PopsError.http(status: response.status.code, requestID: requestID),
                statusCode: response.status.code
            )
        }

        do {
            let data = try await Data(
                collecting: responseBody,
                upTo: Self.maximumErrorBodyBytes
            )
            let envelope = try JSONDecoder().decode(BFMErrorEnvelope.self, from: data)
            throw BFMRuntimePopsError(
                PopsError(
                    code: envelope.code,
                    message: envelope.message,
                    requestID: envelope.requestID ?? requestID,
                    retryable: envelope.hasRetryable
                        ? envelope.retryable
                        : Self.defaultRetryable(status: response.status.code),
                    kind: PopsError.kind(forHTTPStatus: response.status.code)
                ),
                statusCode: response.status.code,
                retryAfterSeconds: envelope.retryAfterSeconds,
                upstreamStatus: envelope.upstreamStatus
            )
        } catch let error as BFMRuntimePopsError {
            throw error
        } catch {
            throw BFMRuntimePopsError(
                PopsError.http(status: response.status.code, requestID: requestID),
                statusCode: response.status.code
            )
        }
    }

    internal static func requestID(from response: HTTPResponse?) -> String? {
        guard let response else { return nil }
        guard let name = HTTPField.Name("X-Request-Id") else { return nil }
        return response.headerFields[name]
    }

    private static func defaultRetryable(status: Int) -> Bool {
        status == 408 || status == 429 || status >= 500
    }
}

internal struct BFMRuntimePopsError: Error, Sendable {
    internal let popsError: PopsError
    internal let statusCode: Int
    internal let retryAfterSeconds: Int?
    internal let upstreamStatus: Int?

    internal init(
        _ popsError: PopsError,
        statusCode: Int,
        retryAfterSeconds: Int? = nil,
        upstreamStatus: Int? = nil
    ) {
        self.popsError = popsError
        self.statusCode = statusCode
        self.retryAfterSeconds = retryAfterSeconds
        self.upstreamStatus = upstreamStatus
    }
}

private struct BFMErrorEnvelope: Decodable {
    let code: String
    let message: String
    let requestID: String?
    let retryable: Bool
    let hasRetryable: Bool
    let retryAfterSeconds: Int?
    let upstreamStatus: Int?

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        code = try container.decode(String.self, forKey: .code)
        message = try container.decode(String.self, forKey: .message)
        requestID = try container.decodeIfPresent(String.self, forKey: .requestID)
        hasRetryable = container.contains(.retryable)
        if hasRetryable {
            retryable = try container.decode(Bool.self, forKey: .retryable)
        } else {
            retryable = false
        }
        retryAfterSeconds = try container.decodeIfPresent(Int.self, forKey: .retryAfterSeconds)
        upstreamStatus =
            (try? container.decode(UpstreamDetails.self, forKey: .details))?
            .upstream?.status
    }

    private enum CodingKeys: String, CodingKey {
        case code
        case message
        case requestID = "requestId"
        case retryable
        case retryAfterSeconds
        case details
    }

    private struct UpstreamDetails: Decodable {
        let upstream: Upstream?
    }

    private struct Upstream: Decodable {
        let status: Int
    }
}

internal struct BFMRuntimeFailure: Sendable {
    internal let popsError: PopsError
    internal let statusCode: Int?
    internal let retryAfterSeconds: Int?
    internal let upstreamStatus: Int?
}

extension PopsError {
    internal static func kind(forHTTPStatus status: Int) -> Kind {
        status >= 500 ? .server : .client
    }

    internal static func http(status: Int, requestID: String?) -> PopsError {
        PopsError(
            code: "ios.http.\(status)",
            message: "Request failed (HTTP \(status))",
            requestID: requestID,
            retryable: status == 408 || status == 429 || status >= 500,
            kind: kind(forHTTPStatus: status)
        )
    }

    internal static func runtimeFailure(from error: ClientError) -> PopsError? {
        runtimeFailureDetails(from: error)?.popsError
    }

    internal static func runtimeFailureDetails(from error: ClientError) -> BFMRuntimeFailure? {
        if let runtime = error.underlyingError as? BFMRuntimePopsError {
            return BFMRuntimeFailure(
                popsError: runtime.popsError,
                statusCode: runtime.statusCode,
                retryAfterSeconds: runtime.retryAfterSeconds,
                upstreamStatus: runtime.upstreamStatus
            )
        }
        if let urlError = error.underlyingError as? URLError {
            return BFMRuntimeFailure(
                popsError: urlError.code == .timedOut ? .timeout : .offline,
                statusCode: error.response?.status.code,
                retryAfterSeconds: nil,
                upstreamStatus: nil
            )
        }
        if error.response?.status.kind == .successful, error.underlyingError is DecodingError {
            return BFMRuntimeFailure(
                popsError: .decodeFailure(
                    requestID: BFMErrorDecodingMiddleware.requestID(from: error.response)),
                statusCode: error.response?.status.code,
                retryAfterSeconds: nil,
                upstreamStatus: nil
            )
        }
        return nil
    }

    private static var offline: PopsError {
        PopsError(
            code: "ios.net.offline",
            message: "The request could not reach the server",
            retryable: true,
            kind: .offline
        )
    }

    private static var timeout: PopsError {
        PopsError(
            code: "ios.net.timeout",
            message: "Request timed out",
            retryable: true,
            kind: .timeout
        )
    }

    private static func decodeFailure(requestID: String?) -> PopsError {
        PopsError(
            code: "ios.decode.failed",
            message: "The server returned a response this version could not read",
            requestID: requestID,
            retryable: false,
            kind: .client
        )
    }
}
